-- Due-based per-store scheduling. Instead of scraping every enabled store on one
-- fixed cycle, the scraper only scrapes stores that are actually "due":
--   never scraped (last_scraped_at IS NULL), or last_scraped_at older than the
--   store's own check_interval_minutes.
-- Naming mirrors snipe_tasks.check_interval. Existing stores default to 15 min
-- (unchanged effective behavior until an interval is shortened manually).
ALTER TABLE stores
  ADD COLUMN check_interval_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN last_scraped_at        timestamptz;
