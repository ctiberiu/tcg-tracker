# Architecture

## System Shape

Monolith with two independently deployed runtimes sharing a Supabase PostgreSQL backend:

1. **Frontend SPA** — React app deployed to Vercel
2. **Scraper** — Node.js script executed by GitHub Actions

## Main Components

### Frontend (`src/`)
- **Pages**: LoginPage, DashboardPage, AdminPage — route-level components
- **Hooks**: useAuth, useProducts, useStores — data fetching and state management via Supabase client
- **Components**: AppSidebar, ProtectedRoute — shared UI and auth guard
- **Lib**: Supabase client initialization, TypeScript types

### Scraper (`scraper/`)
- **scraper.js** — main script that fetches store configs from DB, launches Playwright, runs store-specific scrape functions, upserts products, and sends email alerts
- **Store scrapers**: pokemonia (Gomag), shopify, hobby_planet (MerchantPro), regatul_jocurilor (PrestaShop) — each uses `page.evaluate()` to extract products from DOM
- **isTcgProduct filter** — keyword-based filter to exclude non-TCG merchandise

### Supabase Edge Function (`supabase/functions/trigger-scrape/`)
- Deno function that authenticates requests, then dispatches a GitHub Actions workflow via GitHub PAT

## Data Flow

```
[Cron / Admin UI]
       |
       v
[GitHub Actions] --> [scraper.js] --> [Playwright Browser]
       |                                     |
       |                              [Store Websites]
       |                                     |
       v                                     v
[Supabase DB] <-- upsert products ---- [Scraped Data]
       |
       v
[Resend API] --> Email alerts (new products)
       |
       v
[React SPA] <-- reads products/stores from Supabase
```

## Database Schema (3 tables)

- **products** — scraped product listings (url is unique key for upsert)
- **stores** — store configurations (name, URL, scraper_type, selectors, enabled flag)
- **scrape_runs** — tracks individual scrape execution status for the admin UI

## Cross-Cutting Concerns

- **Authentication**: Supabase Auth with email/password; single allowed user enforced via `VITE_ALLOWED_EMAIL` env var
- **Authorization**: Supabase RLS policies restrict all tables to authenticated users only
- **Configuration**: Environment variables (`.env` for frontend, secrets for scraper/edge function)
- **Error handling**: Try/catch in scraper with console logging; React hooks surface errors to UI

## Deployment Topology

- **Frontend**: Vercel (static SPA with catch-all rewrite)
- **Scraper**: GitHub Actions Ubuntu runner (installs Chromium each run)
- **Database**: Supabase hosted PostgreSQL
- **Edge Function**: Supabase Edge Functions (Deno Deploy)
