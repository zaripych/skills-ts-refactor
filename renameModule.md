# renameModule

Renames a directory or a single module file in place, keeping it under the same
parent. Rewrites every importer across the project and preserves each import's
original style.

- A path-alias import keeps its alias: `@/somewhere/<old>/another/path` becomes
  `@/somewhere/<new>/another/path`. The directory may sit anywhere in the path.
- A relative import stays relative and is recomputed only when the rename
  changes the path between the two files.
- Imports that do not reference the renamed module are left untouched.
- Module-mock paths in `jest.mock` / `vi.mock` / `vitest.mock` (and their
  `doMock`, `unmock`, `setMock`, `requireActual`, `requireMock` siblings) are
  rewritten with the same alias/relative rules, even though they are call
  arguments rather than real imports.

## Workflow

1. **Confirm the target** — the directory or `.ts`/`.tsx` file to rename, and
   the new last-segment name.
2. **Run with `--diff`** to preview. Review the diff.
3. **Run without `--diff`** to apply, after confirmation (or when the user
   requested automatic execution).

## Usage

```sh
SKILL_DIR=<this skill's base directory>
TSX="$SKILL_DIR/scripts/node_modules/.bin/tsx"

# Rename a directory (preview)
"$TSX" "$SKILL_DIR/scripts/rename-module" \
    --project-root /path/to/project --diff src/core/widgets gadgets

# Rename a file module (preview)
"$TSX" "$SKILL_DIR/scripts/rename-module" \
    --project-root /path/to/project --diff src/lib/parser.ts reader

# Rewrite touched relative imports to the @/ alias (preview)
"$TSX" "$SKILL_DIR/scripts/rename-module" \
    --project-root /path/to/project --diff src/lib helpers --absolute-imports @/

# Apply: re-run the same command without --diff
```

## Arguments

- `source` — directory or module file to rename. Accepts a project-relative path
  (`src/core/widgets`), an absolute path, or a path-alias (`@/core/widgets`).
- `new-name` — the new last segment. For a file, omit the extension; the
  original extension is kept.
- `--project-root` — project root (default: git repository root of the current
  directory).
- `--diff` — preview mode. Print the diff, write nothing.
- `--absolute-imports [prefix]` — optional. Rewrite **touched** relative imports
  to an alias instead of recomputing them as relative. Only imports whose path
  changes because of the rename are affected. The optional `prefix` selects the
  alias (e.g. `@/`). When omitted, the most specific alias that contains the
  target is used. Imports already written as aliases keep their alias. Imports
  that the rename does not touch are left unchanged.

## Notes

- The new name replaces only the final segment. The module stays in the same
  parent directory.
- Alias resolution reads the `paths` and `baseUrl` from the project's
  `tsconfig.json`.
- Wildcard aliases (`@/*`) are rewritten automatically. An exact alias that maps
  to a single file (`"@parser": ["./src/lib/parser.ts"]`) cannot be: the rename
  invalidates the tsconfig target itself, which this refactor does not edit.
  When a renamed file is referenced through such an alias the run aborts and
  lists the affected entries. Update the tsconfig `paths` entry by hand, or
  remove the exact alias, then re-run.
