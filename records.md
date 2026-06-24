# Refactor records

A refactor record is a terse, machine-facing note about one applied refactor. It
exists so the change can later be rebased onto a main that moved on, and so a
conflict resolution can be checked for reintroduced artifacts. It is **not** a
PR description or a commit message. Keep every section short.

## Where records live

In the **target project** (the one being refactored, resolved from
`--project-root`), at:

```
docs/refactors/YYYY-MM-DD-<slug>.md
```

The date prefix and slug are a human label and a uniqueness key only. They do
**not** encode replay order — that comes from git history (see
[rebase.md](rebase.md)).

## When to write

After applying a refactor, once any manual follow-up edits and verification are
done. Write the record but **do not commit it** — leave it dirty in the working
tree so whatever commits next bundles it into the same PR for review. Skip
entirely when the user requested No record.

## Append vs create

Decide from the working-tree state of the records directory:

```sh
git status --porcelain docs/refactors/
```

- **Non-empty** — an uncommitted record already belongs to the current PR.
  Append a new entry to that file. If more than one record is dirty, append to
  the most recently modified and note which.
- **Empty** — the previous record already shipped. Create a new
  `YYYY-MM-DD-<slug>.md`.

A file therefore accumulates entries until it is committed, then the next
refactor starts a fresh file — one record file per PR.

## Entry format

Each entry is one refactor. Multiple entries stack in the file in the order they
were applied.

```markdown
# <slug>

## What

<1–2 terse sentences: what was renamed to what>

## Scope

Script runs:

1. `rename-module <source> <new-name> [flags]`
2. ...

Out of scope: <what the user explicitly excluded, e.g. "renamed only under
src/lib/\*\*, left src/legacy as-is">. Omit when obvious from the parameters.

## Manual edits

1. `<path>` — <what changed>; before `<snippet>` → after `<snippet>`
2. ...

## Verification

\`\`\`sh grep -rqF "<old/path>" src && exit 1 || true test -d <new/path> \`\`\`
```

### Scope

List each script invocation with its real parameters, in run order. Record the
explicit non-targets the user named; leave the line out when the parameters
already make the boundary obvious.

### Manual edits

List edits in the order made, each with a file path and a before/after snippet
small enough to locate the spot. These cover changes the scripts cannot make
(non-TypeScript config, prose, runtime path strings).

### Verification

Terse `sh` blocks, each expected to exit `0`. The point is leftover detection:
assert no old path remains and the new path exists.

Assert with `<find> && exit 1 || true` rather than a leading `!` negation
(`! grep ...`), which is not portable across shells. Prefer `grep -rqF` (`-F`
for literal paths), installed by default on macOS and Linux, over tools like
`rg` that may be absent. Search positive paths (e.g. `src`) rather than
excluding the records directory, so the record's own text is never a match:

- no old path remains: `grep -rqF "<old/path>" src && exit 1 || true`
- new path exists: `test -d <new/path>`
- old path removed: `test -d <old/path> && exit 1 || true`

When a check would exceed roughly three lines or needs AST/filesystem logic,
write a sibling test instead: `docs/refactors/<name>.test.ts`, same basename as
the record. Reference it from the Verification section with the exact command to
run it. These tests are temporary helpers — run them explicitly with the
project's own runner (jest, vitest, or whatever the repo uses) and keep them out
of CI discovery. They are not committed long-term test suites.
