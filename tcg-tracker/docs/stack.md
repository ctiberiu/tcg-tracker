# Stack

## Languages and Versions

| Language     | Version   | Source of Truth          |
|-------------|-----------|--------------------------|
| TypeScript  | ~5.9.3    | `package.json` devDeps   |
| JavaScript  | ES Modules| `scraper/package.json`   |
| Node.js     | 20        | `.github/workflows/scraper.yml` |
| Deno        | std@0.168  | `supabase/functions/trigger-scrape/index.ts` |

## Frameworks and Libraries

### Frontend
- **React** 19.2 — UI framework
- **React Router DOM** 7.13 — client-side routing
- **Tailwind CSS** 4.2 — utility-first styling via `@tailwindcss/vite` plugin
- **Vite** 8.0 — build tool and dev server

### Scraper
- **Playwright** 1.58 + `playwright-extra` — headless browser automation with stealth
- **Resend** 6.9 — transactional email API for alerts

### Shared
- **@supabase/supabase-js** 2.100 — Supabase client (used by both frontend and scraper)

## Build Tools and Package Managers

- **npm** — package manager for both frontend and scraper
- **Vite** — frontend build (`tsc -b && vite build`)
- **ESLint** 9 + `typescript-eslint` — linting

## Datastores

- **Supabase (PostgreSQL)** — primary datastore for products, stores, and scrape_runs tables
- Row Level Security enabled on all tables (authenticated access only)

## Infrastructure / Deployment

- **Vercel** — frontend hosting with SPA rewrites (`vercel.json`)
- **GitHub Actions** — scraper execution (cron every 2 hours + manual dispatch)
- **Supabase Edge Functions** — Deno runtime, bridges UI scrape requests to GitHub Actions via `workflow_dispatch`

## Observability

- Console logging in scraper (product counts, errors, sync results)
- No structured logging, metrics, or tracing in place
