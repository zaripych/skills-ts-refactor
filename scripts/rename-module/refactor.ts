import path from 'node:path'
import type { SourceFile, StringLiteral } from 'ts-morph'
import type { Argv } from 'yargs'
import { type BaseArgv, type Refactor, RefactorContext } from '../bootstrap.ts'
import {
  aliasMappingForSpecifier,
  isRelativeSpecifier,
  readAliasMappings,
  readExactAliasTargets,
  resolveAliasOrPath,
  resolveSpecifierToPath,
  selectAbsoluteMapping,
  stripModuleExtension,
  toAliasSpecifier,
} from './specifiers.ts'
import { findMockModuleLiterals } from './mockCalls.ts'

const setupArgs = (yargs: BaseArgv) =>
  yargs
    .usage('$0 <source> <newName>')
    .option('absoluteImports', {
      type: 'string',
      describe: 'Rewrite touched relative imports to an alias (optional prefix, e.g. @/)',
    })

type Options = ReturnType<typeof setupArgs> extends Argv<infer O> ? O : never

const toPosix = (value: string): string => value.split(path.sep).join('/')

type Captured = {
  literal: StringLiteral
  target: SourceFile
  oldText: string
}

const refactor = async (ctx: RefactorContext<Options>): Promise<void> => {
  const [source, newName] = ctx.positionals
  if (!source || !newName) {
    throw new Error('Usage: renameModule <source-dir-or-file> <new-name>')
  }

  const compilerOptions = ctx.project.getCompilerOptions()
  const aliasMappings = readAliasMappings({
    paths: compilerOptions.paths ?? {},
    projectRoot: ctx.tsConfigDir,
    baseUrl: compilerOptions.baseUrl ?? '.',
  })

  const sourcePath = toPosix(resolveAliasOrPath({ value: source, projectRoot: ctx.projectRoot, aliasMappings }))
  const directory = ctx.project.getDirectory(sourcePath)
  const sourceFile = ctx.project.getSourceFile(sourcePath)
  if (!directory && !sourceFile) {
    throw new Error(`Source is not part of the project: ${sourcePath}`)
  }

  const movedFiles = directory
    ? directory.getDescendantSourceFiles()
    : sourceFile
      ? [sourceFile]
      : []

  // Exact (non-wildcard) path aliases point at a single file. Renaming that file
  // invalidates the tsconfig target itself, which this refactor does not rewrite.
  // Refuse rather than silently leave the alias pointing at the old file.
  const exactAliasTargets = readExactAliasTargets({
    paths: compilerOptions.paths ?? {},
    projectRoot: ctx.tsConfigDir,
    baseUrl: compilerOptions.baseUrl ?? '.',
  })
  const movedNormalizedPaths = new Set(movedFiles.map((file) => stripModuleExtension(file.getFilePath())))
  const blockedAliases = exactAliasTargets.filter((alias) =>
    movedNormalizedPaths.has(stripModuleExtension(alias.targetPath)),
  )
  if (blockedAliases.length > 0) {
    const lines = blockedAliases
      .map((alias) => `  ${alias.alias} -> ${path.relative(ctx.projectRoot, alias.targetPath)}`)
      .join('\n')
    throw new Error(
      `Refusing to rename: these files are referenced through exact tsconfig path aliases ` +
        `whose targets this refactor cannot rewrite:\n${lines}\n` +
        `Update the tsconfig "paths" entry by hand, or remove the exact alias.`,
    )
  }

  // Capture every literal that references a file being moved, before the move.
  // ts-morph resolves these (including aliases) but only rewrites relative ones,
  // so we keep the rest to fix afterwards.
  const captured: Captured[] = []
  for (const movedFile of movedFiles) {
    for (const literal of movedFile.getReferencingLiteralsInOtherSourceFiles()) {
      captured.push({ literal, target: movedFile, oldText: literal.getLiteralText() })
    }
  }

  // Module-mock calls (jest.mock/vi.mock/vitest.mock) reference a module by a
  // string path that ts-morph does not resolve, so they are absent from the
  // referencing literals above. Match each mock path against a moved file and
  // capture it for the same alias/relative rewrite the imports receive.
  const movedByNormalizedPath = new Map<string, SourceFile>()
  for (const movedFile of movedFiles) {
    movedByNormalizedPath.set(stripModuleExtension(movedFile.getFilePath()), movedFile)
  }

  const capturedMocks: Captured[] = []
  for (const file of ctx.project.getSourceFiles()) {
    for (const literal of findMockModuleLiterals(file)) {
      const specifier = literal.getLiteralText()
      const resolved = stripModuleExtension(
        resolveSpecifierToPath({
          specifier,
          containingFilePath: file.getFilePath(),
          projectRoot: ctx.projectRoot,
          aliasMappings,
        }),
      )
      const target = movedByNormalizedPath.get(resolved)
      if (target) capturedMocks.push({ literal, target, oldText: specifier })
    }
  }

  const newPath = directory
    ? path.join(path.dirname(sourcePath), newName)
    : path.join(path.dirname(sourcePath), newName + path.extname(sourcePath))

  console.log(`Renaming ${path.relative(ctx.projectRoot, sourcePath)} -> ${newName}`)

  if (directory) {
    directory.move(newPath)
  } else if (sourceFile) {
    sourceFile.move(newPath)
  }

  const absoluteImportsValue = ctx.args.absoluteImports
  const absoluteImports =
    absoluteImportsValue === undefined
      ? undefined
      : { prefix: absoluteImportsValue === '' ? undefined : absoluteImportsValue }

  for (const { literal, target, oldText } of captured) {
    if (literal.wasForgotten()) continue
    const targetFilePath = target.getFilePath()

    if (!isRelativeSpecifier(oldText)) {
      // ts-morph left this alias stale — rebuild it in the same alias family.
      const mapping = aliasMappingForSpecifier({ value: oldText, aliasMappings })
      if (mapping) {
        literal.setLiteralValue(toAliasSpecifier({ mapping, targetFilePath }))
      }
    } else if (absoluteImports && literal.getLiteralText() !== oldText) {
      // ts-morph rewrote this relative import; convert the touched ones to alias.
      const mapping = selectAbsoluteMapping({ aliasMappings, prefix: absoluteImports.prefix, targetFilePath })
      if (mapping) {
        literal.setLiteralValue(toAliasSpecifier({ mapping, targetFilePath }))
      }
    }
  }

  // ts-morph never touched the mock paths, so rebuild each one fully: alias
  // paths in the same family, relative paths recomputed (or aliased when
  // --absolute-imports is requested).
  for (const { literal, target, oldText } of capturedMocks) {
    if (literal.wasForgotten()) continue
    const targetFilePath = target.getFilePath()

    let newValue: string | undefined
    if (!isRelativeSpecifier(oldText)) {
      const mapping = aliasMappingForSpecifier({ value: oldText, aliasMappings })
      if (mapping) newValue = toAliasSpecifier({ mapping, targetFilePath })
    } else if (absoluteImports) {
      const mapping = selectAbsoluteMapping({ aliasMappings, prefix: absoluteImports.prefix, targetFilePath })
      newValue = mapping
        ? toAliasSpecifier({ mapping, targetFilePath })
        : literal.getSourceFile().getRelativePathAsModuleSpecifierTo(target)
    } else {
      newValue = literal.getSourceFile().getRelativePathAsModuleSpecifierTo(target)
    }

    if (newValue !== undefined && newValue !== oldText) literal.setLiteralValue(newValue)
  }
}

export const renameModule: Refactor<Options> = {
  description: 'Rename a directory or module in place',
  setupArgs,
  refactor,
}
