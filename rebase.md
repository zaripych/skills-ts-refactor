# refactor rebase

Strategy for landing a branch on a main that has absorbed large-scale refactors
since the branch was cut. The branch still uses the old names, so a plain rebase
conflicts heavily.

This is the manual strategy. Replaying the recorded refactor scripts onto the
rebased state is **out of scope** for now — replaying a transform on a different
base can diverge or fail.

## Steps

1. **Squash** the branch's changes into a single commit. One commit conflicts
   once per file instead of once per commit.
2. **Rebase** onto the target branch and **resolve conflicts manually**. Use the
   records added to main during this window as the old→new reference for each
   rename — list them with:

   ```sh
   OLD_BASE=$(git merge-base ORIG_HEAD <upstream>)
   NEW_BASE=$(git merge-base HEAD <upstream>)
   git log --reverse --diff-filter=A --name-only --format= \
     "$OLD_BASE".."$NEW_BASE" -- docs/refactors/
   ```

   `<upstream>` is the branch being rebased onto (e.g. `origin/main`).

3. **Verify** immediately with `refactor verify` (see [verify.md](verify.md)) to
   confirm the resolution did not reintroduce renamed-away artifacts. Run it
   right after the rebase, while `ORIG_HEAD` still points at the pre-rebase tip.

## Why ORIG_HEAD

`git rebase` sets `ORIG_HEAD` to the branch tip before the rebase. The
pre-rebase tip and current upstream diverge exactly at the original fork point,
so `git merge-base ORIG_HEAD <upstream>` recovers the old base. Any later
rebase, merge, or reset overwrites `ORIG_HEAD` — hence verifying straight away.
