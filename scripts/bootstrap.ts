import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { Project, type StandardizedFilePath } from 'ts-morph'
import yargs, { type ArgumentsCamelCase, type Argv } from 'yargs'

const execFileAsync = promisify(execFile)

const baseBuilder = (argv: string[]) =>
  yargs(argv)
    .option('projectRoot', {
      type: 'string',
      describe: 'Project root (default: git repository root)',
    })
    .option('diff', {
      type: 'boolean',
      default: false,
      describe: 'Preview mode: print the diff, write nothing',
    })
    .strictOptions()
    .version(false)

// The options every refactor inherits from the base builder. A refactor's own
// options extend this set.
export type BaseOptions = {
  projectRoot: string | undefined
  diff: boolean
}

// The yargs builder a refactor's setupArgs receives. It already carries the
// common --project-root and --diff options; setupArgs adds refactor-specific
// options on top.
export type BaseArgv = ReturnType<typeof baseBuilder>

export type SetupArgs<O extends BaseOptions> = (yargs: BaseArgv) => Argv<O>

// A refactor bundles its description, its own argument parsing, and the
// transform. The bootstrap stays agnostic of any refactor-specific flags.
export type Refactor<O extends BaseOptions> = {
  description: string
  setupArgs: SetupArgs<O>
  refactor: (ctx: RefactorContext<O>) => void | Promise<void>
}

export const parseArgs = <O extends BaseOptions>({
  argv,
  setupArgs,
}: {
  argv: string[]
  setupArgs: SetupArgs<O>
}): ArgumentsCamelCase<O> => setupArgs(baseBuilder(argv)).parseSync()

// The refactor mutates ts-morph nodes directly (set module specifiers, call
// sourceFile.move(), etc.). ts-morph is the single source of truth for the
// refactored state; the context holds no parallel edit model.
export class RefactorContext<O extends BaseOptions> {
  readonly project: Project
  readonly args: ArgumentsCamelCase<O>
  readonly projectRoot: string
  readonly tsConfigDir: string

  constructor({
    project,
    args,
    projectRoot,
    tsConfigDir,
  }: {
    project: Project
    args: ArgumentsCamelCase<O>
    projectRoot: string
    tsConfigDir: string
  }) {
    this.project = project
    this.args = args
    this.projectRoot = projectRoot
    this.tsConfigDir = tsConfigDir
  }

  get positionals(): string[] {
    return this.args._.map(String)
  }
}

const gitRepoRoot = async (cwd: string): Promise<string | undefined> => {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd })
    return stdout.trim()
  } catch {
    return undefined
  }
}

const gitTreeHash = async (cwd: string): Promise<string | undefined> => {
  // Hash the entire working tree (tracked + untracked) into a tree object using
  // a throwaway index, so the real index is never touched. Unlike `git stash
  // create`, this returns a value for a clean tree too, so the dry-run guard
  // still runs when the repo has no pending changes.
  const indexFile = path.join(os.tmpdir(), `ts-refactor-index-${process.pid}-${Date.now()}`)
  const env = { ...process.env, GIT_INDEX_FILE: indexFile }
  try {
    await execFileAsync('git', ['add', '-A'], { cwd, env })
    const tree = await execFileAsync('git', ['write-tree'], { cwd, env })
    return tree.stdout.trim()
  } catch {
    return undefined
  } finally {
    await rm(indexFile, { force: true })
  }
}

export const resolveProjectRoot = async (projectRoot: string | undefined): Promise<string> => {
  if (projectRoot !== undefined) return path.resolve(projectRoot)
  const detected = await gitRepoRoot(process.cwd())
  if (detected === undefined) {
    throw new Error('Not in a git repo. Pass --project-root explicitly.')
  }
  return detected
}

type FileChange = {
  kind: 'modified' | 'added' | 'removed' | 'renamed'
  oldPath: string | undefined
  path: string
  original: string
  updated: string
}

// Derive changes by comparing ts-morph's in-memory state against the real
// filesystem (read through ts-morph's filesystem host). Nothing is saved yet,
// so the disk still holds the pre-refactor content. Only unsaved files are read
// from disk — ts-morph's isSaved() flags exactly the files the refactor touched,
// so untouched files are never read.
const computeChanges = async ({
  project,
  originalPaths,
}: {
  project: Project
  originalPaths: Set<StandardizedFilePath>
}): Promise<FileChange[]> => {
  const fileSystem = project.getFileSystem()
  const sourceFiles = project.getSourceFiles()
  const currentPaths = new Set(sourceFiles.map((sf) => sf.getFilePath()))

  const changes: FileChange[] = []
  const added: { path: StandardizedFilePath; updated: string }[] = []

  for (const sourceFile of sourceFiles) {
    if (sourceFile.isSaved()) continue
    const filePath = sourceFile.getFilePath()
    const updated = sourceFile.getFullText()
    if (originalPaths.has(filePath)) {
      const original = await fileSystem.readFile(filePath)
      if (original !== updated) {
        changes.push({ kind: 'modified', oldPath: undefined, path: filePath, original, updated })
      }
    } else {
      added.push({ path: filePath, updated })
    }
  }

  const removed = [...originalPaths].filter((filePath) => !currentPaths.has(filePath))

  for (const entry of added) {
    const matchIndex = removed.findIndex((r) => path.basename(r) === path.basename(entry.path))
    const onlyMatch =
      matchIndex !== -1 &&
      removed.filter((r) => path.basename(r) === path.basename(entry.path)).length === 1
    if (onlyMatch) {
      const [oldPath] = removed.splice(matchIndex, 1)
      const original = await fileSystem.readFile(oldPath)
      changes.push({ kind: 'renamed', oldPath, path: entry.path, original, updated: entry.updated })
    } else {
      changes.push({ kind: 'added', oldPath: undefined, path: entry.path, original: '', updated: entry.updated })
    }
  }

  for (const oldPath of removed) {
    const original = await fileSystem.readFile(oldPath)
    changes.push({ kind: 'removed', oldPath: undefined, path: oldPath, original, updated: '' })
  }

  return changes.sort((a, b) => a.path.localeCompare(b.path))
}

const RED = process.env.NO_COLOR ? '' : '\u001b[31m'
const GREEN = process.env.NO_COLOR ? '' : '\u001b[32m'
const CYAN = process.env.NO_COLOR ? '' : '\u001b[36m'
const BOLD = process.env.NO_COLOR ? '' : '\u001b[1m'
const DIM = process.env.NO_COLOR ? '' : '\u001b[2m'
const RESET = process.env.NO_COLOR ? '' : '\u001b[0m'

const relativeLabel = ({ projectRoot, filePath }: { projectRoot: string; filePath: string }): string =>
  path.relative(projectRoot, filePath) || filePath

const changeLabel = ({ projectRoot, change }: { projectRoot: string; change: FileChange }): string => {
  const target = relativeLabel({ projectRoot, filePath: change.path })
  if (change.kind === 'renamed' && change.oldPath) {
    return `${relativeLabel({ projectRoot, filePath: change.oldPath })} -> ${target}`
  }
  if (change.kind === 'added') return `${target} (added)`
  if (change.kind === 'removed') return `${target} (removed)`
  return target
}

const formatDiff = (change: FileChange): string => {
  const oldLines = change.original.split('\n')
  const newLines = change.updated.split('\n')
  const out: string[] = []
  for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
    const oldLine = oldLines[i]
    const newLine = newLines[i]
    if (oldLine === newLine) continue
    if (oldLine !== undefined) out.push(`${DIM}${i + 1}${RESET} ${RED}- ${oldLine}${RESET}`)
    if (newLine !== undefined) out.push(`${DIM}${i + 1}${RESET} ${GREEN}+ ${newLine}${RESET}`)
  }
  return out.join('\n')
}

const printChanges = ({
  projectRoot,
  changes,
  applied,
}: {
  projectRoot: string
  changes: FileChange[]
  applied: boolean
}): void => {
  console.log(applied ? `Applied ${changes.length} change(s):` : `Would apply ${changes.length} change(s):`)
  for (const change of changes) {
    const label = changeLabel({ projectRoot, change })
    console.log(`${CYAN}${label}${RESET}`)
    if (!applied && change.original !== change.updated) {
      console.log(formatDiff(change))
    }
  }
}

export const run = async <O extends BaseOptions>({
  refactor,
  argv,
}: {
  refactor: Refactor<O>
  argv?: string[]
}): Promise<void> => {
  const args = parseArgs({ argv: argv ?? process.argv.slice(2), setupArgs: refactor.setupArgs })
  const projectRoot = await resolveProjectRoot(args.projectRoot)
  const tsConfigPath = path.join(projectRoot, 'tsconfig.json')
  const project = new Project({ tsConfigFilePath: tsConfigPath })

  const ctx = new RefactorContext({
    project,
    args,
    projectRoot,
    tsConfigDir: path.dirname(tsConfigPath),
  })

  if (refactor.description) console.log(refactor.description)

  const originalPaths = new Set(project.getSourceFiles().map((sf) => sf.getFilePath()))

  const gitRoot = await gitRepoRoot(projectRoot)
  const snapshot = gitRoot ? await gitTreeHash(gitRoot) : undefined

  await refactor.refactor(ctx)

  const changes = await computeChanges({ project, originalPaths })

  if (changes.length === 0) {
    console.log('No changes needed.')
    return
  }

  if (args.diff) {
    printChanges({ projectRoot, changes, applied: false })
    if (gitRoot && snapshot !== undefined && (await gitTreeHash(gitRoot)) !== snapshot) {
      console.error('ERROR: working tree changed during dry-run. This is a bug.')
    }
    console.log('\nTo apply, re-run without --diff.')
  } else {
    await project.save()
    printChanges({ projectRoot, changes, applied: true })
  }
}
