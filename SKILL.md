---
name: refactor
description: "Perform AST-aware TypeScript refactors using ts-morph, preserving each import's original style (path alias or relative). Renames directories and module files anywhere in the tree and rewrites all importers across the project, including test-runner mock paths. Records each applied refactor so the change can later be rebased onto a moved-on main and verified. Runs in dry-run by default and shows a diff before applying. Triggers: 'rename directory', 'rename module', 'rename folder', 'move module', 'rename across files', 'update imports', 'refactor rebase', 'refactor verify', 'rebase onto refactored main', 'verify refactor', or needs AST-aware TypeScript source transformation."
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, AskUserQuestion
---

# TypeScript Refactor

Use ts-morph for AST-aware TypeScript refactoring. ts-morph parses the project
through its tsconfig, resolves every import/export/dynamic-import specifier, and
rewrites callers precisely — safer than regex for source transformation.

## Capabilities

Route on the request:

- **Refactor** (default) — rename a directory or module and rewrite importers.
  Any rename/move request lands here. After applying, record the refactor
  unless the user opted out. See [records.md](records.md).
- **Rebase** — `refactor rebase`. Strategy for landing a branch on a main that
  has since absorbed other refactors. See [rebase.md](rebase.md).
- **Verify** — `refactor verify`. Confirm a conflict resolution did not
  reintroduce renamed-away artifacts. See [verify.md](verify.md).

When the request names no capability, treat it as Refactor.

The scripts preserve each import's existing style. An import written through a
path alias (`@/feature/x`) stays an alias after the rename. A relative import
(`../feature/x`) stays relative. Only the affected path segment changes.

## Script location

All scripts live in this skill's `scripts/` directory — **not** in the target
project. Each refactor is a subdirectory with an `index.ts` entry point. Docs
use relative paths like `scripts/rename-module` for brevity. Resolve them
against this skill's base directory:

```sh
SKILL_DIR=<this skill's base directory>
```

## Prerequisites

Install the scripts' own dependencies once (ts-morph, TypeScript, tsx, vitest):

```sh
cd "$SKILL_DIR/scripts" && npm install
```

The target project needs a `tsconfig.json` at its root and a git repository.

## Running a script

Invoke the bundled `tsx` binary directly so dependencies resolve from the
skill's `scripts/node_modules`, regardless of the current directory:

```sh
"$SKILL_DIR/scripts/node_modules/.bin/tsx" "$SKILL_DIR/scripts/rename-module" \
    --project-root /path/to/project --diff src/old-dir new-name
```

`--project-root` defaults to the git repository root of the current directory
when omitted.

## Operational workflow

**Dry-run is the default behaviour.** Every refactor runs twice:

1. **Run with `--diff`** to preview. The script prints a unified diff and writes
   nothing to disk. It also verifies the git working tree is unchanged.
2. **Review the diff** with the user (or confirm autonomously when the user
   requested automatic execution).
3. **Run without `--diff`** to apply. Only then are files written and moved.
4. **Record the refactor.** After applying — including any manual follow-up
   edits and verification — author a record so the change can later be rebased
   and verified. See [records.md](records.md). Do not commit it; leave it in the
   working tree for review alongside the refactor. Skip this step only when the
   user requested No record.

Never apply without first showing the `--diff` output.

## Behavioural Modifiers

Detect these from the user's natural language:

| Behaviour | Cues                                                          | Default | Effect                                                |
| --------- | ------------------------------------------------------------ | ------- | ----------------------------------------------------- |
| Auto      | "just do it", "go ahead", "no need to confirm", "auto"       | Off     | Run `--diff`, then apply without pausing for approval  |
| Dry-run   | "just show me", "preview", "dry run", "don't actually..."     | On      | Run with `--diff` only and stop                       |
| No record | "no record", "don't record", "skip the record", "without a record" | Off | Apply the refactor but skip authoring the record       |

Dry-run is on by default. Applying changes always requires either explicit user
confirmation after the diff, or the Auto behaviour. Recording is on by default;
No record suppresses only the record, not the refactor.

## When to use ts-morph vs direct edits

Use a script when the refactor touches imports or symbols across multiple files —
ts-morph resolves references and rewrites all callers. Use the edit tool or a
grep-driven change when the edit is localized (≤3 files, confirm with grep) or
non-TypeScript.

## Available scripts

Each script has a companion `.md` file with the exact workflow. **Read the
companion doc before running a script.**

| Script          | What it does                                          | Doc                                |
| --------------- | ----------------------------------------------------- | ---------------------------------- |
| `rename-module` | Rename a directory or module file in place, rewriting all importers and preserving alias/relative style | [renameModule.md](renameModule.md) |

## Custom refactoring scripts

If no existing script fits, write a custom one on top of the bootstrap. See
[customScripts.md](customScripts.md) — MANDATORY when writing any refactor
script.

## References

| File                                 | Load                                       |
| ------------------------------------ | ------------------------------------------ |
| [renameModule.md](renameModule.md)   | Before running `rename-module`             |
| [records.md](records.md)             | Before authoring a refactor record         |
| [rebase.md](rebase.md)               | For `refactor rebase`                      |
| [verify.md](verify.md)               | For `refactor verify`                      |
| [customScripts.md](customScripts.md) | MANDATORY when writing any refactor script |

## Keywords

ts-morph, refactor, typescript, AST, rename directory, rename module, rename
folder, path alias, import rewrite, module specifier, dry-run,
diff, cross-file rename, refactor record, rebase, verify, conflict resolution,
merge base, stale reference
