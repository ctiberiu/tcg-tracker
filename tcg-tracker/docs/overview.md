# Overview

## Purpose and Scope

TCG Tracker monitors Romanian online stores for Pokemon TCG product availability and pricing. It automatically scrapes product listings on a cron schedule, persists them to a Supabase database, and sends email alerts when new products are detected.

## High-Level Capabilities

- **Automated scraping** of 5 Romanian TCG stores (Pokemonia, RedGoblin, TCGarena, Hobby-Planet, RegatulJocurilor)
- **Product dashboard** with filtering by store, price range, stock status, and text search
- **Admin panel** for managing store configurations and triggering manual scrapes
- **Email alerts** via Resend API for newly discovered products
- **Single-user auth** via Supabase Auth with email whitelist

## Primary Entry Points

- **Web UI** — React SPA served via Vercel at `/login`, `/dashboard`, `/admin`
- **Scraper CLI** — `node scraper.js` run via GitHub Actions (cron or workflow_dispatch)
- **Edge Function** — Supabase Edge Function `trigger-scrape` bridges UI to GitHub Actions

## Project Shape

Monolith with two runtime components (frontend SPA + scraper script) sharing a Supabase backend. Not a monorepo — each component has its own `package.json` but lives in the same repo.

## Key Directories

| Directory                     | Role                                          |
|-------------------------------|-----------------------------------------------|
| `src/`                        | React frontend (pages, hooks, components, lib)|
| `scraper/`                    | Node.js scraping script + dependencies        |
| `supabase/migrations/`        | SQL migration files for Supabase PostgreSQL    |
| `supabase/functions/`         | Deno-based Supabase Edge Functions             |
| `.github/workflows/`          | GitHub Actions CI for scheduled scraping       |
| `public/`                     | Static assets for Vite                         |
