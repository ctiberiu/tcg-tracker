# Testing

## Current State

No test framework is configured. There are no unit, integration, or E2E tests in the project.

## Test Frameworks

- None configured (no Jest, Vitest, Playwright Test, or similar in dependencies)

## Recommended Setup

### Frontend (recommended: Vitest)
- Already using Vite; Vitest integrates natively
- Add `vitest` to devDependencies
- Test hooks (useProducts, useStores, useAuth) with mocked Supabase client
- Test component rendering with `@testing-library/react`

### Scraper (recommended: Vitest or Node test runner)
- Unit test `isTcgProduct()` filter function
- Mock `page.evaluate()` results for each scraper function

### E2E (recommended: Playwright Test)
- Playwright is already a scraper dependency
- Add `@playwright/test` for UI E2E testing

## Coverage / Quality Gates

- None in place
- ESLint is the only code quality check (`npm run lint`)
