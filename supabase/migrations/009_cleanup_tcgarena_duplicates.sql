-- One-time migration: clean up stale/duplicate TCGarena product rows
-- and normalize all product URLs to canonical form.
-- Safe to re-run (idempotent).

-- Step 1: Normalize ALL product URLs in-place
-- Strips query params, fragments, trailing slashes, and lowercases.
-- Uses regexp_replace and lower() to match the JS normalizeProductUrl() logic.
UPDATE products
SET url = lower(
  regexp_replace(
    regexp_replace(url, '[?#].*$', ''),  -- strip query params and fragments
    '/+$', ''                             -- strip trailing slashes
  )
)
WHERE url IS DISTINCT FROM lower(
  regexp_replace(
    regexp_replace(url, '[?#].*$', ''),
    '/+$', ''
  )
);

-- Step 2: Delete duplicate rows that now have the same normalized URL.
-- Keep the row with the newest first_seen for each duplicate set.
DELETE FROM products
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY url ORDER BY first_seen DESC) AS rn
    FROM products
  ) ranked
  WHERE rn > 1
);

-- Step 3: Set all TCGarena products to in_stock = false as a baseline.
-- The next scrape run will correctly update stock status via the staleness sweep.
UPDATE products
SET in_stock = false
WHERE store_name = 'TCGarena'
  AND in_stock = true;
