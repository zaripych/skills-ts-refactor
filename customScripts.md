# Writing Custom Refactor Scripts

All refactor scripts MUST use [scripts/bootstrap.ts](scripts/bootstrap.ts). It
provides project setup from `tsconfig.json`, `--diff` dry-run mode, git safety
verification, diff display, and the `RefactorContext`.

ts-morph is the single source of truth for the refactored state. A refactor
mutates ts-morph nodes directly — set module specifiers, call `sourceFile.move()`
or `directory.move()`. The bootstrap holds no parallel edit model: it derives the
diff by comparing ts-morph's in-memory state against the filesystem, and writes
everything through `project.save()`. A refactor never touches the filesystem
directly.

Each refactor lives in its own `scripts/<name>/` directory with three files:
`specifiers.ts` (helpers), `refactor.ts` (the `Refactor` bundle), and `index.ts`
(the entry point that wires the bundle into `run`). The skill invokes the
directory, which resolves to `index.ts`.

A `Refactor` bundles three things: a `description`, a `setupArgs` function that
adds refactor-specific yargs options on top of the common ones, and the
`refactor` transform. The bootstrap stays agnostic of any refactor-specific
flags — it only knows `--project-root` and `--diff`.

## refactor.ts

```ts
import type { Argv } from 'yargs'
import { type BaseArgv, type Refactor, RefactorContext } from '../bootstrap.ts'

const setupArgs = (yargs: BaseArgv) =>
  yargs.option('myFlag', { type: 'string', describe: 'A refactor-specific option' })

type Options = ReturnType<typeof setupArgs> extends Argv<infer O> ? O : never

const refactor = async (ctx: RefactorContext<Options>): Promise<void> => {
  const [target] = ctx.positionals
  const myFlag = ctx.args.myFlag // typed string | undefined
  for (const sourceFile of ctx.project.getSourceFiles()) {
    // mutate ts-morph nodes directly, e.g.
    //   literal.setLiteralValue(newValue)
    //   sourceFile.move(newPath)  /  directory.move(newPath)
  }
}

export const myRefactor: Refactor<Options> = {
  description: 'My refactor script',
  setupArgs,
  refactor,
}
```

Camel-case option names are still accepted in their hyphenated form on the CLI
(`--my-flag` maps to `myFlag`). An option declared `type: 'string'` with no value
on the command line parses to `''`, which lets a flag carry an optional value.

## index.ts

```ts
import { run } from '../bootstrap.ts'
import { myRefactor } from './refactor.ts'

await run({ refactor: myRefactor })
```

## Bootstrap CLI flags

`run()` always parses these — do not re-declare them in `setupArgs`:

- `--project-root` (optional) — project root, default git repository root.
- `--diff` — dry-run: print the diff, write nothing.

Positional arguments are read from `ctx.positionals`.

**Always run with `--diff` first**, then apply.

## RefactorContext API

| Member                                          | Purpose                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ctx.project`                                   | The ts-morph `Project`, loaded from the target `tsconfig.json`                            |
| `ctx.args`                                      | Parsed args: `projectRoot`, `diff`, plus the refactor's own options                      |
| `ctx.positionals`                               | Positional arguments as `string[]`                                                       |
| `ctx.projectRoot` / `ctx.tsConfigDir`           | Resolved absolute paths                                                                   |

## Preserving import style

ts-morph's `move()` rewrites referencing imports, but only the **relative** ones
— it deliberately leaves alias (and other non-relative) specifiers untouched. So
a rename works in two steps: capture the referencing literals before the move
(`sourceFile.getReferencingLiteralsInOtherSourceFiles()`), move via ts-morph,
then rebuild the non-relative ones in the same alias family afterwards.

The helpers in
[scripts/rename-module/specifiers.ts](scripts/rename-module/specifiers.ts) read
the tsconfig alias mappings, classify a specifier as relative, pick the alias
family, and build an alias specifier for a target file.
[scripts/rename-module/refactor.ts](scripts/rename-module/refactor.ts) is the
reference consumer.

## How changes are applied

The refactor mutates ts-morph only. `run()` then derives the diff by comparing
ts-morph's in-memory source files against the filesystem (read through ts-morph's
filesystem host, which still holds the pre-refactor content because nothing has
been saved):

- **Dry-run (`--diff`)**: compute the diff, print it, verify the git tree is
  unchanged, exit. `project.save()` is never called.
- **Apply**: `project.save()` flushes every edit, move, and deletion through
  ts-morph.

Never write to the filesystem directly in a refactor function — that bypasses
dry-run and the diff.

## Testing

Add a fixture project under the refactor's own `fixtures/` directory and a
vitest spec (`refactor.test.ts`) beside it. The `setupRefactoring` harness copies
a fixture into a temp directory with `await using` auto-cleanup and binds the
refactor bundle. Pass `import.meta.dirname` so the harness resolves the fixture
relative to the test. The harness exposes a `run` that supplies
`--project-root`, the `diff` flag, and your positional `args`:

```ts
await using harness = await setupRefactoring({
  importMetaDirname: import.meta.dirname,
  fixturePath: 'fixtures/fixture-rename',
  refactor: myRefactor,
})
const { run, readFile, readStructure } = harness

await run({ args: ['src/old-dir', 'new-name'], diff: false })
// then assert via readFile({ relativePath }) and readStructure()
```

See [scripts/testing/setupRefactoring.ts](scripts/testing/setupRefactoring.ts)
and
[scripts/rename-module/refactor.test.ts](scripts/rename-module/refactor.test.ts).
