# Operations

## Common Tasks

| Task                | Command                                    |
|---------------------|--------------------------------------------|
| Dev server          | `npm run dev`                              |
| Production build    | `npm run build`                            |
| Lint                | `npm run lint`                             |
| Preview build       | `npm run preview`                          |
| Run scraper locally | `cd scraper && node scraper.js`            |
| Run single store    | `SCRAPE_STORE_ID=<uuid> node scraper.js`   |

## Scraper Schedule

- Automated: GitHub Actions cron runs every 2 **minutes** (`*/2 * * * *`). Cheap because most runs
  find only a handful of stores actually due — each store has its own `check_interval_minutes`
  (currently 15 for every row).
- Each run scrapes **at most one store row per domain**. `stores` holds one row per shop per game,
  so nine rows can be one web server; see "Adding a New Store" below for what that means in practice.
- Weekly: `.github/workflows/digest.yml` sends the scraper-health digest (Mondays 07:00 UTC).
- Manual: Admin UI "Scrape Now" button triggers via Supabase Edge Function -> GitHub Actions
  `workflow_dispatch`. A single-store manual trigger bypasses the one-row-per-domain cap.

## Maintenance Routines

### Database Migrations
- Migration files are in `supabase/migrations/` numbered sequentially
- Apply new migrations via Supabase SQL editor or `scraper/run-migrations.js`

### Adding a New Store
1. Add the store via the Admin UI (name, URL, scraper type, selectors)
2. If the store uses an unsupported platform, add a new scrape function in `scraper/scraper.js` and register it in `SCRAPER_MAP`
3. Add the new scraper type to `ScraperType` union in `src/lib/types.ts` and `SCRAPER_TYPES` in `AdminPage.tsx`

> **Adding a row to a domain that already has rows slows down every row on that domain.**
> Store rows are per-shop-per-game, and the scraper takes at most one row per domain per run
> (`capOnePerDomain` in `scraper/schedule.js`). A domain's steady-state period is therefore roughly
> `rows on that domain x 2 minutes`, so each row added to a shared host costs **every** row on that
> host another ~2 minutes.
>
> This compounds, and it bites hardest where things are already tightest. Measured on the current
> 67-row / 20-domain set: `lexshop.ro` has 9 rows and sits at ~18 min against a 15-min interval.
> Rolling one more game across the shared hosts takes it to 10 rows / ~20 min, the next to ~22, and
> so on. Everything else is at the ~16-min floor that a 15-min interval on a 2-min cron produces
> anyway, so those domains currently cost nothing.
>
> Games are added in batches (see migrations 025-028), which is exactly when this is easiest to
> miss. Before adding a batch, check the row count on the hosts involved. If a domain's
> `rows x 2 min` is drifting past what that store needs, the fix is a shorter
> `check_interval_minutes` elsewhere or splitting the load — not removing the cap, which is what
> keeps the scraper from looking like a bot to a shared WAF.

### Adding a New Scraper Type
1. Implement `scrapeNewPlatform(page, store)` function in `scraper/scraper.js`
2. Add it to `SCRAPER_MAP`
3. Update frontend types and admin dropdown

## Troubleshooting

| Issue                          | Fix                                           |
|--------------------------------|-----------------------------------------------|
| Scraper timeout on a store     | Check if store URL changed; increase timeout  |
| Products not appearing         | Verify CSS selectors match current store HTML  |
| Auth not working               | Check `VITE_ALLOWED_EMAIL` matches the user   |
| Edge function CORS error       | Add origin to `ALLOWED_ORIGIN` env var        |
| GitHub Actions dispatch fails  | Verify `GITHUB_PAT` has `actions:write` scope |
| `npm run dev` serves a blank page, console shows `$RefreshReg$ is not defined` | An ambient `NODE_ENV=production` in your shell. Run `NODE_ENV=development npm run dev`. Verified: the error appears on every route with `NODE_ENV=production` and disappears entirely with `development`, same code. Nothing in the repo sets `NODE_ENV` — it comes from the shell. |
| `tsc: command not found` after `npm i` | Same cause: with `NODE_ENV=production` npm sets `omit=dev` and prunes all devDependencies. Recover with `NODE_ENV=development npm install --include=dev`. |
| Local bundle is ~240 kB bigger than production | You built with `NODE_ENV=development`. That is required for `npm install`/`npm ci` (otherwise npm prunes devDependencies) but **must not be used for `npm run build`** — it makes Vite emit a React *development* bundle. Measured on one commit: 805.8 kB with it, 566.4 kB without, against 565.0 kB deployed. Build with `env -u NODE_ENV npm run build`. |

## Logs

- Scraper: GitHub Actions workflow logs (stdout/stderr)
- Edge Function: Supabase dashboard > Edge Functions > Logs
- Frontend: Browser console only
