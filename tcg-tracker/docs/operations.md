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

- Automated: GitHub Actions cron runs every 2 hours (`0 */2 * * *`)
- Manual: Admin UI "Scrape Now" button triggers via Supabase Edge Function -> GitHub Actions `workflow_dispatch`

## Maintenance Routines

### Database Migrations
- Migration files are in `supabase/migrations/` numbered sequentially
- Apply new migrations via Supabase SQL editor or `scraper/run-migrations.js`

### Adding a New Store
1. Add the store via the Admin UI (name, URL, scraper type, selectors)
2. If the store uses an unsupported platform, add a new scrape function in `scraper/scraper.js` and register it in `SCRAPER_MAP`
3. Add the new scraper type to `ScraperType` union in `src/lib/types.ts` and `SCRAPER_TYPES` in `AdminPage.tsx`

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

## Logs

- Scraper: GitHub Actions workflow logs (stdout/stderr)
- Edge Function: Supabase dashboard > Edge Functions > Logs
- Frontend: Browser console only
