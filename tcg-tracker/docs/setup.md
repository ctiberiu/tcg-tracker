# Setup

## Prerequisites

- **Node.js** 20+
- **npm** (bundled with Node.js)
- **Supabase project** with PostgreSQL database
- **Playwright** requires Chromium (auto-installed via `npx playwright install`)

## Install Steps

### Frontend
```bash
cd tcg-tracker
npm install
```

### Scraper
```bash
cd tcg-tracker/scraper
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
| `RESEND_API_KEY`   | Resend API key for email alerts          | No       |
| `ALERT_EMAIL_TO`   | Email address for alert notifications    | No       |

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
