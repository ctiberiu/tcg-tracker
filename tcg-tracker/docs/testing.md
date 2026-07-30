# Testing

## Current State

**Vitest is installed but there is no node-environment runner, which is not the same as
"no test framework".** The distinction matters, because the second reading makes testing look
unavailable when the tooling is mostly already here.

What exists:
- `vitest ^4.1.10` and `storybook ^10.4.6` in the frontend `devDependencies`
- `vite.config.ts` defines exactly one Vitest project: `storybook`, running in **browser mode**
  via `@vitest/browser-playwright`, sourced from the Storybook stories
- No `test` script in `package.json`

What is missing:
- **A node-environment Vitest project.** Nothing can currently run a plain `.test.js` against
  non-DOM code
- `scraper/package.json` has no vitest at all, so scraper logic has no runner of its own
- No unit, integration or E2E tests outside the Storybook stories

Consequence in practice: pure scraper logic (`schedule.js`, `block-detection.js`, `digest.js`)
is exported and unit-testable, but has been verified with throwaway harnesses run under plain
`node` rather than committed tests — because there is nowhere for a committed test to live.
Adding a node project to `vite.config.ts` is the unblocking step.

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
