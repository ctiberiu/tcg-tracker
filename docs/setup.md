# Setup

## Prerequisites

- **Node.js** 20+
- **npm** (bundled with Node.js)
- **Supabase project** with PostgreSQL database
- **Playwright** requires Chromium (auto-installed via `npx playwright install`)

## Install Steps

### Frontend
```bash
npm install
```

### Scraper
```bash
cd scraper
npm install
npx playwright install --with-deps chromium
```

## Environment Variables

### Frontend (`.env` in project root)
| Variable               | Description                           | Required |
|------------------------|---------------------------------------|----------|
| `VITE_SUPABASE_URL`   | Supabase project URL                  | Yes      |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key      | Yes      |
| `VITE_ALLOWED_EMAIL`  | Email address allowed to log in       | Yes      |

### Scraper (`scraper/.env`)
| Variable           | Description                              | Required |
|--------------------|------------------------------------------|----------|
| `SUPABASE_URL`     | Supabase project URL                     | Yes      |
| `SUPABASE_KEY`     | Supabase service role key (for inserts)  | Yes      |
| `GMAIL_USER`       | Gmail address used as the SMTP sender    | No       |
| `GMAIL_APP_PASSWORD` | Gmail app password (16 chars)          | No       |
| `ALERT_EMAIL_TO`   | Admin recipient(s), comma-separated. Also the fallback/redirect inbox | No |
| `ALERT_MODE`       | Which transport subscriber alerts use — see below. Defaults to `dry` | No |
| `ZEPTOMAIL_TOKEN`  | Required only when `ALERT_MODE=live`     | No       |
| `ALERT_FROM`       | From address, required when `ALERT_MODE=live` | No  |

There are **two independent mail paths**, and only one of them can spend money:

- **Admin/operational mail** — store auto-disabled notices and the weekly health digest.
  Always Gmail, always to `ALERT_EMAIL_TO`, and deliberately **not** gated by `ALERT_MODE`.
  If the Gmail vars are unset it is skipped silently; the console log is the fallback.
- **Subscriber restock alerts** — the only metered path, gated by `ALERT_MODE`:

| `ALERT_MODE` | Behaviour |
|--------------|-----------|
| `dry` (default) | Render and log only. Sends nothing, spends nothing |
| `redirect`   | Sends the real rendered email over Gmail to `ALERT_EMAIL_TO`. Full end-to-end check without touching ZeptoMail |
| `gmail`      | Real subscribers, over Gmail. Free, but Gmail is not a bulk sender |
| `live`       | ZeptoMail to the real `subscribers` table |

Anything unrecognised falls back to `dry`. In GitHub Actions this is a **repo variable**, not a
secret — editing `scraper/.env` has no effect on the scheduled run.

### Supabase Edge Function (set in Supabase dashboard)
| Variable           | Description                              |
|--------------------|------------------------------------------|
| `SUPABASE_URL`     | Supabase project URL                     |
| `SUPABASE_ANON_KEY`| Supabase anonymous key                   |
| `GITHUB_PAT`       | GitHub Personal Access Token             |
| `GITHUB_REPO`      | GitHub repo (owner/repo format)          |
| `ALLOWED_ORIGIN`   | Comma-separated allowed CORS origins     |

## Database Setup

Run migrations in order against Supabase PostgreSQL:
```
supabase/migrations/001_create_products.sql
supabase/migrations/002_allow_nullable_price.sql
supabase/migrations/003_create_stores.sql
supabase/migrations/004_add_in_stock_and_indexes.sql
supabase/migrations/005_create_scrape_runs.sql
supabase/migrations/006_in_stock_not_null.sql
```

Or use the migration runner: `cd scraper && node run-migrations.js`

## How to Run

### Development
```bash
npm run dev    # Starts Vite dev server (frontend)
```

### Production Build
```bash
npm run build  # tsc -b && vite build -> outputs to dist/
```

### Run Scraper Locally
```bash
cd scraper
node scraper.js
```

## Linting
```bash
npm run lint   # ESLint on all .ts/.tsx files
```
