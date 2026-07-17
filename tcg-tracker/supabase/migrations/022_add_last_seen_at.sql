-- Tracks the last time a product was actually observed in a scrape (regardless
-- of its reported in_stock value), so the staleness sweep can require a
-- product to be *continuously* missing for a grace period before flipping it
-- to out-of-stock — instead of flipping on a single miss.
--
-- Real-world motivation: a hot, low-quantity SKU can briefly disappear from a
-- store's listing when a shopper's cart reservation holds the last unit, then
-- reappear minutes later when the hold expires. Flipping in_stock on the very
-- first miss turns that normal cart-hold cycle into a "restock" alert storm
-- (confirmed on Noriel, ~15 min check interval, 20+ alerts/day for one item).
--
-- Backfilled to now() for existing rows so nothing is treated as already-stale
-- the moment this migration runs.

ALTER TABLE products ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX idx_products_last_seen_at ON products (last_seen_at);
