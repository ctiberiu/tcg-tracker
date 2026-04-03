# Risks

## Known Risks and Gaps

- **No tests** — zero test coverage across frontend and scraper; regressions are caught manually
- **Hardcoded credential** in `scraper/run-migrations.js` — contains a plaintext PostgreSQL connection string with password
- **Fragile scrapers** — scraper functions depend on specific CSS selectors and DOM structures of external store websites; any store redesign breaks scraping
- **Single-user auth** — `VITE_ALLOWED_EMAIL` env var restricts access to one user; no role system or multi-user support
- **No rate limiting** — the admin "Scrape Now" button can trigger unlimited GitHub Actions runs

## Security and Secrets Handling

- Frontend secrets prefixed with `VITE_` are embedded in the client bundle (Supabase anon key is designed to be public)
- Scraper uses `SUPABASE_KEY` (service role key) — stored in GitHub Actions secrets
- `GITHUB_PAT` stored in Supabase Edge Function secrets
- `.env` file exists in repo with actual values (should be gitignored)
- `run-migrations.js` contains a hardcoded database connection string with credentials

## Fragile Areas

- **Store scraper functions** — tightly coupled to each store's current HTML structure
- **`isTcgProduct()` keyword filter** — hardcoded keyword lists; false positives/negatives for new product naming patterns
- **Edge Function CORS** — hardcoded default origin; must be updated for new deployment URLs
- **Polling in AdminPage** — 5-second interval polling for scrape run status with 5-minute timeout; no WebSocket/realtime fallback

## Unknowns and Open Questions

- Whether Supabase RLS policies are sufficient for security (service role key bypasses RLS in scraper)
- How stale data is handled (no product expiry or "last seen" tracking)
- Whether `run-migrations.js` credential has been rotated since being committed
