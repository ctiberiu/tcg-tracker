# Code Map

## Directory Map

| Path                                    | Purpose                                          |
|-----------------------------------------|--------------------------------------------------|
| `src/`                                  | React frontend source code                       |
| `src/pages/`                            | Route-level page components (Login, Dashboard, Admin) |
| `src/hooks/`                            | Custom React hooks for auth, products, stores    |
| `src/components/`                       | Shared UI components (sidebar, auth guard)       |
| `src/lib/`                              | Supabase client init, TypeScript type definitions|
| `src/assets/`                           | Static images (hero.png, SVGs)                   |
| `scraper/`                              | Node.js web scraper script and dependencies      |
| `supabase/migrations/`                  | SQL migration files (001–006)                    |
| `supabase/functions/trigger-scrape/`    | Supabase Edge Function (Deno)                    |
| `.github/workflows/`                    | GitHub Actions workflow for scraper               |
| `public/`                               | Vite static assets                               |
| `dist/`                                 | Build output (gitignored in production)          |

## Application Entry Points

| Entry Point                             | Runtime    | Purpose                          |
|-----------------------------------------|------------|----------------------------------|
| `src/main.tsx`                          | Browser    | React SPA bootstrap              |
| `scraper/scraper.js`                    | Node.js    | Scraper main script              |
| `supabase/functions/trigger-scrape/index.ts` | Deno  | Edge Function for manual scrapes |

## Important Configuration Files

| File                    | Controls                                              |
|-------------------------|-------------------------------------------------------|
| `package.json`          | Frontend dependencies, build/lint/dev scripts         |
| `scraper/package.json`  | Scraper dependencies                                  |
| `vite.config.ts`        | Vite build config with React + Tailwind plugins       |
| `tsconfig.json`         | TypeScript project references                         |
| `tsconfig.app.json`     | Frontend TS config                                    |
| `eslint.config.js`      | ESLint rules for TS/React                             |
| `vercel.json`           | Vercel SPA rewrite rules                              |
| `index.html`            | HTML shell for Vite SPA                               |
| `.env.example`          | Required frontend env vars template                   |
| `scraper/.env.example`  | Required scraper env vars template                    |
| `src/index.css`         | Tailwind config with custom theme (dark Material You) |

## Notable Scripts

| Command             | Location           | Purpose                         |
|---------------------|--------------------|---------------------------------|
| `npm run dev`       | root `package.json`| Start Vite dev server           |
| `npm run build`     | root `package.json`| TypeScript check + Vite build   |
| `npm run lint`      | root `package.json`| Run ESLint                      |
| `npm run scrape`    | `scraper/`         | Run scraper locally             |

## Ignored Paths

- `node_modules/` — npm dependencies (both root and scraper)
- `dist/` — Vite build output
- `supabase/.temp/` — Supabase CLI temp files
