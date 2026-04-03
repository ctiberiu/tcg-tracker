# TCG Tracker Documentation

**TCG Tracker** is a web-based price tracking and alerting tool for Pokemon Trading Card Game (TCG) products sold by Romanian online stores. It scrapes product listings, stores them in Supabase, and provides a dashboard for browsing and filtering results with email alerts for new products.

## Table of Contents

- [Overview](overview.md)
- [Stack](stack.md)
- [Architecture](architecture.md)
- [Code Map](code-map.md)
- [Setup](setup.md)
- [Operations](operations.md)
- [Testing](testing.md)
- [Dependencies](dependencies.md)
- [Risks](risks.md)
- [AI Agents Guide](ai-agents-guide.md)

## Quick Facts

| Attribute        | Value                                        |
|------------------|----------------------------------------------|
| Languages        | TypeScript (frontend), JavaScript (scraper)  |
| Framework        | React 19, Vite 8, Tailwind CSS 4             |
| Database         | Supabase (PostgreSQL)                        |
| Deployment       | Vercel (frontend), GitHub Actions (scraper)  |
| Auth             | Supabase Auth (email/password, single user)  |
| Notifications    | Resend (email API)                           |
| Scraping Engine  | Playwright + stealth plugin                  |
