import path from 'node:path'

export type AliasMapping = {
  prefix: string
  baseDir: string
}

// A non-wildcard tsconfig `paths` entry, e.g. `"@/utils/logger": ["src/utils/logger.ts"]`.
// Its target is a single file rather than a directory prefix.
export type ExactAliasTarget = {
  alias: string
  targetPath: string
}

const MODULE_EXTENSION = /\.(d\.ts|tsx?|mts|cts|jsx?|mjs|cjs)$/

const toPosix = (value: string): string => value.split(path.sep).join('/')

export const readAliasMappings = ({
  paths,
  projectRoot,
  baseUrl,
}: {
  paths: Record<string, string[]>
  projectRoot: string
  baseUrl: string
}): AliasMapping[] => {
  const mappings: AliasMapping[] = []
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!pattern.endsWith('/*')) continue
    const target = targets[0]
    if (target === undefined || !target.endsWith('/*')) continue
    const prefix = pattern.slice(0, -1)
    const targetDir = target.slice(0, -2)
    const baseDir = path.resolve(projectRoot, baseUrl, targetDir)
    mappings.push({ prefix, baseDir })
  }
  return mappings.sort((a, b) => b.prefix.length - a.prefix.length)
}

// Non-wildcard `paths` entries, resolved to absolute target file paths. These
// map a single specifier to a single file, so a rename invalidates the tsconfig
// target itself rather than just the importer's specifier suffix.
export const readExactAliasTargets = ({
  paths,
  projectRoot,
  baseUrl,
}: {
  paths: Record<string, string[]>
  projectRoot: string
  baseUrl: string
}): ExactAliasTarget[] => {
  const targets: ExactAliasTarget[] = []
  for (const [alias, candidates] of Object.entries(paths)) {
    if (alias.endsWith('/*')) continue
    const target = candidates[0]
    if (target === undefined || target.endsWith('/*')) continue
    targets.push({
      alias,
      targetPath: path.resolve(projectRoot, baseUrl, target),
    })
  }
  return targets
}

export const isRelativeSpecifier = (value: string): boolean =>
  value === '.' ||
  value === '..' ||
  value.startsWith('./') ||
  value.startsWith('../')

// Strip the module extension and a trailing `/index` so a specifier-resolved
// path and a source file path compare equal regardless of how either spells the
// module.
export const stripModuleExtension = (filePath: string): string =>
  toPosix(filePath.replace(MODULE_EXTENSION, '')).replace(/\/index$/, '')

// Resolve a module specifier written in a file to an absolute path (no
// extension). Relative specifiers resolve against the file's directory; alias
// specifiers resolve through the tsconfig paths.
export const resolveSpecifierToPath = ({
  specifier,
  containingFilePath,
  projectRoot,
  aliasMappings,
}: {
  specifier: string
  containingFilePath: string
  projectRoot: string
  aliasMappings: AliasMapping[]
}): string =>
  isRelativeSpecifier(specifier)
    ? path.resolve(path.dirname(containingFilePath), specifier)
    : resolveAliasOrPath({ value: specifier, projectRoot, aliasMappings })

// The alias mapping whose prefix a specifier was written with (preserves the
// `@features/` vs `@/` family when rebuilding).
export const aliasMappingForSpecifier = ({
  value,
  aliasMappings,
}: {
  value: string
  aliasMappings: AliasMapping[]
}): AliasMapping | undefined =>
  aliasMappings.find(
    (mapping) =>
      value === mapping.prefix.slice(0, -1) || value.startsWith(mapping.prefix)
  )

// The alias mapping to use when converting a relative import to absolute. With
// an explicit prefix, match it; otherwise pick the most specific alias that
// contains the target.
export const selectAbsoluteMapping = ({
  aliasMappings,
  prefix,
  targetFilePath,
}: {
  aliasMappings: AliasMapping[]
  prefix: string | undefined
  targetFilePath: string
}): AliasMapping | undefined => {
  const containing = aliasMappings.filter(
    (mapping) =>
      targetFilePath === mapping.baseDir ||
      targetFilePath.startsWith(`${mapping.baseDir}${path.sep}`)
  )
  if (prefix !== undefined) {
    return containing.find(
      (mapping) =>
        mapping.prefix === prefix || mapping.prefix.slice(0, -1) === prefix
    )
  }
  return [...containing].sort((a, b) => b.baseDir.length - a.baseDir.length)[0]
}

// Build an alias module specifier (e.g. `@/helpers/logger`) for a target file,
// stripping the module extension and a trailing `/index`.
export const toAliasSpecifier = ({
  mapping,
  targetFilePath,
}: {
  mapping: AliasMapping
  targetFilePath: string
}): string => {
  const base = targetFilePath.replace(MODULE_EXTENSION, '')
  let rel = toPosix(path.relative(mapping.baseDir, base)).replace(
    /\/index$/,
    ''
  )
  if (rel === 'index') rel = ''
  return rel === '' ? mapping.prefix.slice(0, -1) : mapping.prefix + rel
}

export const resolveAliasOrPath = ({
  value,
  projectRoot,
  aliasMappings,
}: {
  value: string
  projectRoot: string
  aliasMappings: AliasMapping[]
}): string => {
  const mapping = aliasMappingForSpecifier({ value, aliasMappings })
  if (mapping) {
    const rest =
      value === mapping.prefix.slice(0, -1)
        ? ''
        : value.slice(mapping.prefix.length)
    return path.resolve(mapping.baseDir, rest)
  }
  return path.resolve(projectRoot, value)
}
