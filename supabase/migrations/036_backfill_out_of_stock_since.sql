-- Backfill the out_of_stock_since clock that migration 021 never filled in, and
-- stop the same gap from reopening.
--
-- ── The defect ───────────────────────────────────────────────────────────────
-- 021 added out_of_stock_since plus a trigger that stamps it on the true->false
-- transition. It did NOT backfill. Unlike 022, which added last_seen_at and said
-- so explicitly ("Backfilled to now() for existing rows so nothing is treated as
-- already-stale"), 021 is ADD COLUMN + CREATE TRIGGER and nothing else. So every
-- product that was ALREADY out of stock when 021 ran, and has not transitioned
-- since, still carries NULL. No transition ever fires for a row that is simply
-- staying out of stock, so the trigger can never reach them.
--
-- That is not cosmetic. cleanupStaleProducts (scraper.js:2924) deletes with
--
--   .eq('in_stock', false).lt('out_of_stock_since', cutoff).in('store_id', enabled)
--
-- and in SQL a comparison against NULL is never true. Those rows are permanently
-- exempt from the 7-day cleanup — they accumulate forever.
--
-- Measured 2026-08-16:
--   products total                                     3910
--   in_stock = false                                   2982
--   in_stock = false AND out_of_stock_since IS NULL     771   <- 20% of the table
--     ...on ENABLED stores                              724
--     ...on DISABLED stores                              47
--     ...store_id IS NULL                                 0
--   of the 724: still observed within 24h               540
--                not seen in over 7 days                184
--   first_seen age: min 42d, median 104d, max 136d
--   concentrated in RedGoblin (264) and Pokemania (262) — 73% of the cohort
--
-- ── Why backfill and not DELETE ──────────────────────────────────────────────
-- 540 of the 724 were observed in the last 24h: the stores still list them, just
-- as sold out. Deleting them achieves nothing durable — the next scrape re-inserts
-- them — and re-insertion is the alert trigger: syncToSupabase alerts on
-- new-and-in-stock. Deleting 540 live rows risks firing a storm the moment any of
-- them is back in stock at re-scrape. Restoring the clock instead hands all 724 to
-- the existing 7-day policy, which then removes them on its own terms.
--
-- ── Why enabled stores only ──────────────────────────────────────────────────
-- The 47 rows on disabled stores are left NULL on purpose, mirroring the boundary
-- cleanupStaleProducts already enforces and the reason its comment gives: a
-- disabled store's catalog is frozen, and deleting it means that on re-enable
-- every product returns with no matching row and the "new product" alert fires for
-- the whole catalog at once. Giving those rows a clock dated today would walk them
-- into exactly that: re-enable months later, all 47 are instantly past cutoff,
-- cleanup deletes them, the next scrape re-inserts them. Leaving them NULL keeps
-- the freeze. The trigger fix below picks them up automatically if they are ever
-- re-enabled and scraped again.
--
-- ── Why last_seen_at as the value ────────────────────────────────────────────
-- The true transition instant is unrecoverable — it was never written down.
-- last_seen_at is the most recent moment we can PROVE the product was observed out
-- of stock, so it understates the outage rather than overstating it. That is the
-- conservative direction: a row gets at most 7 more days, never less. It also
-- clears the 184 genuinely-dead rows (last seen 7-30 days ago) on the next cleanup
-- run instead of making them wait a further week, which now() would have done.
--
-- ── Why the trigger has to be disabled for the UPDATE ────────────────────────
-- 021's trigger is BEFORE INSERT OR UPDATE, and for a row whose in_stock is false
-- on both sides it takes the ELSE branch:
--
--   ELSE NEW.out_of_stock_since := OLD.out_of_stock_since;   -- i.e. NULL
--
-- A plain UPDATE therefore reports "UPDATE 724" and writes nothing. The row count
-- looks like success. Verify by SELECT, never by the UPDATE tag.
--
-- ── Replayability ────────────────────────────────────────────────────────────
-- Idempotent by construction. The UPDATE is predicated on IS NULL, so a second run
-- matches 0 rows; CREATE TABLE IF NOT EXISTS, INSERT ... ON CONFLICT DO NOTHING,
-- DROP POLICY IF EXISTS, CREATE OR REPLACE FUNCTION and DISABLE/ENABLE TRIGGER are
-- all repeat-safe. Running twice leaves the same state — the second run is a no-op.
--
-- ── Verify by SELECT, never by a row-count tag ───────────────────────────────
--   SELECT count(*) FROM products_first_seen_snapshot;                    -- 724
--   SELECT count(*) FROM products p JOIN stores s ON p.store_id = s.id
--    WHERE s.is_enabled AND NOT p.in_stock AND p.out_of_stock_since IS NULL; -- 0
--   SELECT count(*) FROM products p JOIN stores s ON p.store_id = s.id
--    WHERE NOT s.is_enabled AND NOT p.in_stock AND p.out_of_stock_since IS NULL; -- 47
-- The 47 on disabled stores are deliberately untouched by both steps.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Preserve first_seen for these rows BEFORE the backfill makes them
--    deletable. This must live in THIS migration, not a later one.
--
--    products.first_seen does not survive the cleanup cycle:
--    trg_preserve_first_seen (004) is BEFORE UPDATE only, so when
--    cleanupStaleProducts DELETEs a stale row and the next sweep re-INSERTs it,
--    first_seen takes DEFAULT now(). Measured 2026-08-16: 2165 of 3909 products
--    (55%) carry a first_seen under 7 days, and 2129 of those have
--    first_seen = out_of_stock_since within the hour — rows inserted while
--    already sold out. The 7-day cleanup window and the 7-day first_seen
--    population are the same window.
--
--    These 724 rows are the ONLY ones left with a truthful first_seen (spanning
--    2026-04-02 to 2026-07-05). They survived precisely because the NULL clock
--    exempted them from cleanup. The backfill below removes that exemption, and
--    184 of them have last_seen_at older than 7 days, so they become deletable
--    on the FIRST scraper run afterwards — not after a week's grace.
--
--    A separate later migration cannot do this: once the UPDATE below runs, the
--    `out_of_stock_since IS NULL` predicate that identifies these rows matches
--    nothing. Capture and backfill have to be one transaction.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products_first_seen_snapshot (
  url          text PRIMARY KEY,
  first_seen   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  store_name   text,
  title        text,
  game         text,
  captured_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE products_first_seen_snapshot IS
  'Point-in-time rescue of products.first_seen for rows that still held a truthful '
  'value before migration 036 handed them to the 7-day cleanup. Keyed by url because '
  'products.id is regenerated on re-insert. Not maintained — a historical record.';

INSERT INTO products_first_seen_snapshot (url, first_seen, last_seen_at, store_name, title, game)
SELECT p.url, p.first_seen, p.last_seen_at, p.store_name, p.title, p.game
  FROM products p
  JOIN stores s ON p.store_id = s.id
 WHERE s.is_enabled = true
   AND p.in_stock = false
   AND p.out_of_stock_since IS NULL
ON CONFLICT (url) DO NOTHING;

ALTER TABLE products_first_seen_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operator can read first_seen snapshot" ON products_first_seen_snapshot;
CREATE POLICY "Operator can read first_seen snapshot"
  ON products_first_seen_snapshot FOR SELECT TO authenticated
  USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. One-off backfill, enabled stores only.
--    The trigger must be off or the ELSE branch above reverts every write.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE products DISABLE TRIGGER trg_set_out_of_stock_since;

UPDATE products p
   SET out_of_stock_since = p.last_seen_at
  FROM stores s
 WHERE p.store_id = s.id
   AND s.is_enabled = true
   AND p.in_stock = false
   AND p.out_of_stock_since IS NULL;

ALTER TABLE products ENABLE TRIGGER trg_set_out_of_stock_since;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Make the trigger self-healing so this class of gap cannot reopen.
--
--    Only the ELSE branch changes: instead of blindly copying OLD (which
--    propagates a NULL forever), it fills a missing clock from the row's own
--    last_seen_at. A row that already has a timestamp still keeps it untouched —
--    that preservation is the whole point of 021 and must not regress, or the
--    "how long has this been out of stock" clock resets on every scrape.
--
--    This is also what covers the 47 disabled-store rows left alone above: they
--    are not scraped, so they are not updated, so they stay NULL and stay frozen.
--    If such a store is ever re-enabled, its first scrape stamps them from
--    last_seen_at and they rejoin the normal 7-day policy.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_out_of_stock_since()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.out_of_stock_since := CASE WHEN NEW.in_stock = false THEN now() ELSE NULL END;
    RETURN NEW;
  END IF;

  IF NEW.in_stock = false AND OLD.in_stock = true THEN
    NEW.out_of_stock_since := now();
  ELSIF NEW.in_stock = true THEN
    NEW.out_of_stock_since := NULL;
  ELSE
    -- Still out of stock on both sides: preserve the existing clock, but adopt one
    -- if the row never got a value (legacy rows predating 021's trigger).
    NEW.out_of_stock_since := COALESCE(OLD.out_of_stock_since, NEW.last_seen_at, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
