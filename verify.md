# refactor verify

Run after a rebase conflict resolution to confirm no renamed-away artifacts were
reintroduced. It runs the Verification section of each record that landed on
main during the rebase.

## Select the records

Scope to the refactors that arrived between the original fork point and the
post-rebase base:

```sh
OLD_BASE=$(git merge-base ORIG_HEAD <upstream>)
NEW_BASE=$(git merge-base HEAD <upstream>)
git log --reverse --diff-filter=A --name-only --format= \
  "$OLD_BASE".."$NEW_BASE" -- docs/refactors/
```

`<upstream>` is the branch that was rebased onto (e.g. `origin/main`). The
`--reverse` ordering replays records in merge order.

If `ORIG_HEAD` is missing or stale (any rebase/merge/reset since), or the diff
is empty, fall back to asking the user which records to run via AskUserQuestion:

```yaml
header: 'Verify'
question: 'Which refactor records should I verify?'
multiSelect: true
options:
  - label: '<record filename>'
    description: '<the record What line>'
```

Build the option list from the files in `docs/refactors/`.

## Run

For each selected record, execute its Verification section:

- Run each `sh` block; every block must exit `0`.
- For a record that points at a sibling `<name>.test.ts`, run it explicitly with
  the project's own runner (jest, vitest, or whatever the repo uses).

Report pass or fail per record. Exit non-zero if any check fails — a failure
means a stale reference (or a missing new path) survived the conflict
resolution.
