-- Replace immediate auto-disable with a flag-first approach: a store that hits
-- the consecutive-failure threshold gets FLAGGED (stays enabled, but checked
-- hourly instead of its normal interval) rather than disabled outright. Only
-- once it has stayed continuously flagged for 12h does the scraper actually
-- disable it (see block-detection.js: BLOCK_FLAG_THRESHOLD, FLAG_DISABLE_GRACE_MS).
ALTER TABLE stores
  ADD COLUMN is_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN flagged_at timestamptz;
