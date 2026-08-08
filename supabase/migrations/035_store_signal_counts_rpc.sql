-- Answer "how many signals per store" with a GROUP BY instead of shipping every
-- row to the browser and counting them there.
--
-- ── The defect ───────────────────────────────────────────────────────────────
-- useSweepSummary asked for the 7-day product window with `.range(0, 9999)` and
-- counted the rows client-side. PostgREST caps a response at 1000 rows and the
-- cap is SERVER-side, so the 10000 was never anything but decoration. Measured
-- on 2026-08-07:
--
--   SELECT count(*) FROM products WHERE first_seen >= now() - interval '7 days'
--     -> 2171
--   GET /products?select=store_id&first_seen=gte.<7d>  (Range: 0-9999)
--     -> HTTP 200, Content-Range 0-999/*, 1000 rows
--
-- 1171 rows — 54% of the window — dropped with no error, no warning and no
-- truncation flag. `signals7d` was understated for every store past the cut, and
-- because the query carried no ORDER BY, WHICH stores got cut was whatever the
-- planner felt like returning. The landing page was the worst place for it: the
-- store sweep panel is the page's proof that the radar is actually sweeping.
--
-- Raising the constant cannot fix this. 10000 already looked generous and did
-- nothing; a bigger number restores exactly the same illusion. The row cap is
-- only escapable by not asking for rows.
--
-- useStoreHealth had the same shape at `.range(0, 9999)` for the in-stock count.
-- Measured the same day it returned 938 of 938 — correct TODAY, with 62 rows of
-- headroom before it starts truncating as silently as the other one did. The
-- products table more than doubled this week. That is not a margin worth
-- keeping, and it is one line to remove.
--
-- ── Why a function and not a PostgREST aggregate ─────────────────────────────
-- `products?select=store_id,count()` is the no-migration version of this and it
-- is rejected by this project: PGRST123 "Use of aggregate functions is not
-- allowed" (db-aggregates-enabled is off). Turning that on is a project-wide
-- PostgREST setting that would expose ad-hoc aggregates over every table to the
-- anon key; a named function exposes exactly this one question.
--
-- ── Rights ───────────────────────────────────────────────────────────────────
-- Deliberately INVOKER-rights, following is_admin() in 033. RLS on `products`
-- therefore still applies, and the anon caller aggregates precisely the rows
-- migration 015's "Public read access for products" policy already lets it
-- SELECT one by one. This grants no new visibility — it replaces 2171 rows over
-- the wire with the count of them. Making it SECURITY DEFINER would be a real
-- privilege surface for zero benefit, and would need search_path pinning.
--
-- Replayable: CREATE OR REPLACE plus idempotent grants, so a partial run retries
-- cleanly. (See 033's note on why that matters here.)

CREATE OR REPLACE FUNCTION store_signal_counts()
RETURNS TABLE (
  store_id       uuid,
  signals_7d     bigint,
  in_stock_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.store_id,
    count(*) FILTER (WHERE p.first_seen >= now() - interval '7 days'),
    count(*) FILTER (WHERE p.in_stock)
  FROM products p
  WHERE p.store_id IS NOT NULL
  GROUP BY p.store_id;
$$;

-- One row per store that has ever had a product (~67), not one row per product
-- (~3721), so the result is nowhere near the 1000-row cap that caused the bug.
-- A store with zero rows in the window is absent from the result rather than
-- present with 0; both callers already default a missing store to 0, and that
-- keeps this from having to know the store roster.

REVOKE ALL ON FUNCTION store_signal_counts() FROM public;
GRANT EXECUTE ON FUNCTION store_signal_counts() TO anon;
GRANT EXECUTE ON FUNCTION store_signal_counts() TO authenticated;
