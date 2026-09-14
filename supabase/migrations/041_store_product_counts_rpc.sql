-- Count the /view store dropdown in Postgres instead of fetching one row per
-- product and counting them in the browser.
--
-- ── The defect ───────────────────────────────────────────────────────────────
-- useStoreCounts gives every shop in the Store dropdown on /view a count. It
-- asked for `products?select=store_id` with `.range(0, 4999)` plus the page's
-- filters, and counted the rows client-side. PostgREST caps a response at 1000
-- rows and the cap is SERVER-side (see 035), so the 4999 did nothing. Measured
-- 2026-09-14:
--
--   no filters         GET ...&offset=0&limit=5000  -> HTTP 206,
--                      Content-Range 0-999/3912, 1000 of 3912 rows
--   in_stock=eq.true   997 matching rows, so all of them fit under the cap
--
-- /view always sends in_stock=eq.true. Its dropdown was therefore right that day,
-- with three rows of headroom — the same position useStoreHealth was in when 035
-- measured it at 938 of 938. The first sweep that takes the in-stock total past
-- 1000 makes every count quietly wrong: no error, and because the query has no
-- ORDER BY, which shops lose rows is up to the planner. The dropdown sorts by
-- count, so its order breaks too. The hook's docblock justified the approach
-- with "the products table is small (hundreds of rows)".
--
-- This is the defect 035 fixed, one hook over, and raising the constant cannot
-- fix it for the same reason: the only way out of the row cap is to not ask for
-- rows.
--
-- ── Parity with the query it replaces ───────────────────────────────────────
-- Each predicate mirrors the PostgREST filter the hook used to send, which is
-- also the filter useProducts applies to the list the counts sit beside:
--
--   p_games          .in('game', games)         skipped when NULL or empty
--   p_min_price      .gte('price', n)           a bound never matches a NULL price
--   p_max_price      .lte('price', n)
--   p_in_stock_only  .eq('in_stock', true)
--   p_search         .ilike('title', `%${s}%`)  skipped when NULL or ''
--
-- PostgREST rewrites every `*` in a like/ilike pattern to `%`, so a search for
-- "pok*box" was a wildcard match. The replace() keeps that, so the counts keep
-- agreeing with the list.
--
-- ── Rights ───────────────────────────────────────────────────────────────────
-- INVOKER, for the reasons given in 035: RLS on `products` still applies, so
-- anon aggregates exactly the rows migration 015's "Public read access for
-- products" policy already lets it read one by one. No new visibility.
--
-- ── Replaying and changing it ────────────────────────────────────────────────
-- Replayable: CREATE OR REPLACE plus idempotent grants. Do not change the
-- argument list in place — CREATE OR REPLACE with different arguments adds a
-- second overload instead of replacing this one, and PostgREST then refuses to
-- choose between them (PGRST203). Drop it first.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS store_product_counts(text[], numeric, numeric, boolean, text);

CREATE OR REPLACE FUNCTION store_product_counts(
  p_games         text[]  DEFAULT NULL,
  p_min_price     numeric DEFAULT NULL,
  p_max_price     numeric DEFAULT NULL,
  p_in_stock_only boolean DEFAULT false,
  p_search        text    DEFAULT NULL
)
RETURNS TABLE (
  store_id      uuid,
  product_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT p.store_id, count(*)
  FROM products p
  WHERE p.store_id IS NOT NULL
    AND (p_games IS NULL OR cardinality(p_games) = 0 OR p.game = ANY (p_games))
    AND (p_min_price IS NULL OR p.price >= p_min_price)
    AND (p_max_price IS NULL OR p.price <= p_max_price)
    AND (p_in_stock_only IS NOT TRUE OR p.in_stock)
    AND (p_search IS NULL OR p_search = '' OR p.title ILIKE ('%' || replace(p_search, '*', '%') || '%'))
  GROUP BY p.store_id;
$$;

-- One row per store row with a match (77 of 96 have any products today), so the
-- result is nowhere near the cap. A store with no match is absent rather than
-- present with 0; the page already defaults a missing store to 0.

REVOKE ALL ON FUNCTION store_product_counts(text[], numeric, numeric, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION store_product_counts(text[], numeric, numeric, boolean, text) TO anon;
GRANT EXECUTE ON FUNCTION store_product_counts(text[], numeric, numeric, boolean, text) TO authenticated;
