# Testing

## Current State

Two Vitest projects, defined in `vite.config.ts`:

| project | environment | covers |
|---|---|---|
| `node` | node | `scraper/**/*.test.js`, plus `src/**/*.node.test.ts` for non-DOM frontend code |
| `storybook` | browser (Playwright/Chromium) | the Storybook stories |

```
npm test          # node project only — fast, no browser
npm run test:watch
npm run test:all  # both projects, incl. the browser one
```

Current coverage is the scraper's pure logic:

- `scraper/block-detection.test.js` — `classifyOutcome`, `applyFailureOutcome`,
  `detectChallengeText`. The pair that gates auto-disable, which has cost real stores twice.
- `scraper/resolve-alert-channel.test.js` — the local-run hard gate, including that `dry`
  yields a **null transporter** (that, not the early return in `sendAlerts`, is what makes its
  real subscriber addresses unreachable).

Still uncovered: `schedule.js` (`capOnePerDomain`, `isStoreDue`), `digest.js` selectors,
`paginateWhileSaturated`. All already exported and pure — the gap is assertions, not design.

> **Write the assertion even if you are not adding a test file.** For most of this project's
> life there was no node runner, and roughly nine verification harnesses were written and
> thrown away. They were never actually blocked: a plain `.mjs` script under `node`, with
> Supabase stubbed, needs no runner at all — and the one that finally got committed caught a
> live defect on its first run, one that three reviewers had missed. The barrier was habit,
> not tooling.

> If a clean install leaves `vitest: command not found`, check `NODE_ENV` first. An ambient
> `NODE_ENV=production` makes npm set `omit=dev` and silently skip every devDependency.

## Recommended Setup

### Frontend (Vitest — already installed)
- Add a second, node-environment project alongside the existing `storybook` browser project
- Test hooks (useProducts, useStores, useAuth) with mocked Supabase client
- Test component rendering with `@testing-library/react`

### Scraper (recommended: Vitest or Node test runner)
- Unit test `isGameProduct(game, title)` filter function
- Mock `page.evaluate()` results for each scraper function

### E2E (recommended: Playwright Test)
- Playwright is already a scraper dependency
- Add `@playwright/test` for UI E2E testing

## Coverage / Quality Gates

- None in place
- ESLint is the only code quality check (`npm run lint`)
