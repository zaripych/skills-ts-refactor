import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { type BaseOptions, type Refactor, run } from '../bootstrap.ts'

const readDirectoryStructure = async (root: string): Promise<string[]> => {
  const entries: string[] = []
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else {
        entries.push(path.relative(root, full).split(path.sep).join('/'))
      }
    }
  }
  await walk(root)
  return entries.sort()
}

export const setupRefactoring = async <O extends BaseOptions>({
  importMetaDirname,
  fixturePath,
  refactor,
}: {
  importMetaDirname: string
  fixturePath: string
  refactor: Refactor<O>
}) => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ts-refactor-'))
  await fs.cp(path.resolve(importMetaDirname, fixturePath), projectPath, { recursive: true })

  return {
    projectPath,
    run: ({ args, diff }: { args: string[]; diff: boolean }): Promise<void> =>
      run({
        refactor,
        argv: ['--project-root', projectPath, ...(diff ? ['--diff'] : []), ...args],
      }),
    readFile: ({ relativePath }: { relativePath: string }): Promise<string> =>
      fs.readFile(path.join(projectPath, relativePath), 'utf8'),
    readStructure: (): Promise<string[]> => readDirectoryStructure(projectPath),
    async [Symbol.asyncDispose](): Promise<void> {
      await fs.rm(projectPath, { recursive: true, force: true })
    },
  }
}
