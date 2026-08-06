# AI Agents Guide

## Coding Conventions

- **TypeScript** for frontend (strict mode via `tsconfig.app.json`)
- **JavaScript (ESM)** for scraper — no TypeScript compilation
- **Functional components** with React hooks (no class components)
- **Custom hooks** pattern for data fetching (`useAuth`, `useProducts`, `useStores`)
- **Tailwind CSS** for all styling — no CSS modules or styled-components
- **Dark theme** with Material You-inspired custom colors defined in `src/index.css`

## Where to Make Changes

### Safe Modifications
- `src/pages/` — adding/modifying page components
- `src/hooks/` — adding/modifying data hooks
- `src/components/` — adding/modifying shared components
- `src/lib/types.ts` — adding/modifying TypeScript interfaces
- `scraper/scraper.js` — adding new store scrapers or fixing selectors
- `supabase/migrations/` — adding new numbered migration files

### Requires Caution
- `src/lib/supabase.ts` — shared Supabase client; changes affect all data access
- `supabase/functions/trigger-scrape/index.ts` — Deno runtime, different from Node.js
- `.github/workflows/scraper.yml` — changes affect automated scraping schedule
- `src/index.css` — theme changes affect all UI components

## How to Run, Test, and Lint

```bash
npm run dev      # Start dev server (hot reload)
npm run build    # TypeScript check + production build
npm run lint     # ESLint
npm run preview  # Preview production build locally
```

Scraper: `cd scraper && node scraper.js`

## Diff/PR Guidance

- When modifying scrapers, verify the target store's current DOM structure first
- When adding new Supabase tables, create a numbered migration file (next: `007_*.sql`)
- When adding new scraper types, update both `scraper/scraper.js` (SCRAPER_MAP) and `src/lib/types.ts` (ScraperType union) and `src/pages/AdminPage.tsx` (SCRAPER_TYPES array)
- Frontend changes should work in both dev and production modes (Vite handles this)

## Guardrails

- Never commit `.env` files with real credentials
- Never install npm packages at runtime in scraper (GitHub Actions installs everything)
- Supabase anon key is safe to expose client-side; service role key must never be in frontend code
- The scraper runs with `SUPABASE_KEY` (service role) which bypasses RLS — be careful with data operations
- Edge Function uses Deno imports (`https://deno.land/std`, `https://esm.sh/`) — do not use npm-style imports
