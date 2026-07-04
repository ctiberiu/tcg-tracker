-- Scraper hardening: track consecutive block-like scrape failures per store so
-- the scraper can auto-disable a store that a site owner has started blocking
-- (rather than silently hammering it). Persists across the per-run scraper
-- process. Reset to 0 on a successful scrape; the scraper flips is_enabled=false
-- when this reaches the threshold. Existing rows default to 0 (unaffected).
ALTER TABLE stores
  ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0;
