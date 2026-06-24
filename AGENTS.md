# ts-refactor skill — development

Scripts and tests live in `scripts/`. Run from that directory.

```sh
cd scripts
npm install        # once
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

Add new refactor scripts on top of `scripts/bootstrap.ts` and document each in a
companion `.md` file at the repo root. See `customScripts.md`.

Each refactor lives in `scripts/<name>/` with `index.ts`, `refactor.ts`,
`specifiers.ts`, a `refactor.test.ts`, and a `fixtures/` directory. The shared
test harness is `scripts/testing/setupRefactoring.ts`. Fixtures are small
self-contained TypeScript projects with their own `tsconfig.json` and `paths`
aliases.
