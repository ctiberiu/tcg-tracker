# Dependencies

## First-Party Components

| Component          | Path                                   | Role                              |
|--------------------|----------------------------------------|-----------------------------------|
| Frontend SPA       | `src/`                                 | React dashboard and admin UI      |
| Scraper            | `scraper/`                             | Playwright-based web scraper      |
| Edge Function      | `supabase/functions/trigger-scrape/`   | Manual scrape trigger bridge      |
| Migrations         | `supabase/migrations/`                 | Database schema definitions       |

## Third-Party Dependencies (by importance)

### Frontend (`package.json`)

| Package                   | Role                          | License |
|---------------------------|-------------------------------|---------|
| `react` / `react-dom`    | UI framework                  | MIT     |
| `react-router-dom`       | Client-side routing           | MIT     |
| `@supabase/supabase-js`  | Database + auth client        | MIT     |
| `tailwindcss`            | CSS utility framework         | MIT     |
| `vite`                   | Build tool / dev server       | MIT     |
| `typescript`             | Type checking                 | Apache-2.0 |
| `eslint`                 | Code linting                  | MIT     |

### Scraper (`scraper/package.json`)

| Package                            | Role                          | License |
|------------------------------------|-------------------------------|---------|
| `playwright` + `playwright-extra`  | Headless browser automation   | Apache-2.0 |
| `puppeteer-extra-plugin-stealth`   | Anti-bot detection evasion    | MIT     |
| `@supabase/supabase-js`           | Database client               | MIT     |
| `resend`                           | Transactional email API       | MIT     |
| `pg` (devDependency)              | PostgreSQL client (migrations)| MIT     |

## Critical Runtime Dependencies

- **Supabase PostgreSQL** — all persistent data (products, stores, scrape_runs)
- **GitHub Actions** — scraper execution environment
- **Vercel** — frontend hosting
- **Resend API** — email notifications (optional; degrades gracefully if not configured)
- **Target store websites** — scraper depends on specific DOM structures of 5 Romanian stores
