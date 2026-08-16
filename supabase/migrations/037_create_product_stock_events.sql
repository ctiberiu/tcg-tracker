-- Append-only log of stock-state transitions. The single most valuable thing
-- missing from this schema, and the only one that cannot be added retroactively.
--
-- ── Why ──────────────────────────────────────────────────────────────────────
-- `products` is current-state only: every sweep upserts over the previous value.
-- Nothing anywhere records that a state CHANGED, so these are all unanswerable:
--   how long did this stay in stock · how many times has it restocked ·
--   what was the shortest sellout this week · was it in stock last Tuesday
--
-- Worse, the two clocks that do exist actively destroy their own history:
--   - out_of_stock_since is set to NULL by migration 021's trigger the moment a
--     product restocks — precisely the moment a restock post needs "gone for N
--     days". Measured 2026-08-16: all 928 in-stock products carry no stock
--     timestamp whatsoever.
--   - first_seen resets on the cleanup cycle. trg_preserve_first_seen (004) is
--     BEFORE UPDATE only, so when cleanupStaleProducts DELETEs a row and the next
--     sweep re-INSERTs it, first_seen takes DEFAULT now(). 2165 of 3909 products
--     (55%) show a first_seen under 7 days; 2129 of those have
--     first_seen = out_of_stock_since within the hour, i.e. inserted while already
--     sold out. A "new products this week" count reads ~2165 against a true ~36.
--
-- Recording first sighting HERE rather than on `products` is what fixes that
-- second one: this table is append-only and never deleted, so the products-row
-- churn cannot reach it. One table closes both gaps.
--
-- ── Identity is the url, not products.id ─────────────────────────────────────
-- products.id is a fresh uuid on every re-insert, so a row deleted by cleanup and
-- restored by the next sweep gets a new id while remaining the same listing. url
-- is the only stable handle, and it is already the upsert conflict key.
--
-- Known limit, not solvable here: identity is per-listing, so a store migrating
-- its URL scheme breaks continuity. Migration 029 records exactly that — ATU-Toys
-- moved its catalogue behind a locale prefix and all 8 store rows 404'd together.
-- Continuity across such a move needs title matching, which is a separate problem.
--
-- ── price_at_event ───────────────────────────────────────────────────────────
-- NOT a price series and not a trend line: exactly one value per transition, and
-- it is the only way T3 can show "the last price we saw while it was available",
-- because products.price is overwritten on every sweep and cannot be read back.
-- The operator has ruled out price HISTORY; this column is deliberately narrower.
-- Kept because the asymmetry is one-directional — dropping the column later is
-- trivial, whereas not recording it loses the values permanently. Confirm the
-- intent, and `ALTER TABLE ... DROP COLUMN price_at_event` if it is unwanted.
--
-- ── Writer bypasses RLS ──────────────────────────────────────────────────────
-- The scraper writes with the service-role key, so the policies here govern
-- client reads only. Operator-only, matching 033.

CREATE TABLE IF NOT EXISTS product_stock_events (
  id                 bigserial PRIMARY KEY,
  url                text NOT NULL,
  store_id           uuid REFERENCES stores (id) ON DELETE SET NULL,
  store_name         text,
  title              text,
  game               text,
  -- first_seen = first sighting on any sweep (survives the products-row churn)
  -- in        = out-of-stock -> in-stock   (a restock)
  -- out       = in-stock -> out-of-stock   (a sellout, or a sustained absence)
  event              text NOT NULL CHECK (event IN ('first_seen', 'in', 'out')),
  changed_at         timestamptz NOT NULL DEFAULT now(),
  -- On 'out': the last price seen while still available. On 'in': the price at
  -- the moment it came back. On 'first_seen': the price at first sighting.
  price_at_event     numeric,
  -- Only meaningful on 'in': what out_of_stock_since held immediately BEFORE the
  -- 021 trigger cleared it, i.e. how long the outage had run. Captured here
  -- because after the write it no longer exists anywhere.
  out_since_at_event timestamptz
);

COMMENT ON TABLE product_stock_events IS
  'Append-only stock transition log. Never deleted, never updated — the products '
  'table is current-state only and its cleanup cycle destroys first_seen. Keyed by '
  'url because products.id is regenerated on re-insert.';

-- Per-product timeline: in-stock and out-of-stock durations, restock counts,
-- median in-stock duration. The dominant read pattern.
CREATE INDEX IF NOT EXISTS idx_pse_url_time ON product_stock_events (url, changed_at DESC);
-- Windowed aggregates for the weekly report ("restocks caught in the last 7 days").
CREATE INDEX IF NOT EXISTS idx_pse_event_time ON product_stock_events (event, changed_at DESC);
-- Per-store and per-game slices.
CREATE INDEX IF NOT EXISTS idx_pse_store_time ON product_stock_events (store_id, changed_at DESC);

ALTER TABLE product_stock_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operator can read stock events" ON product_stock_events;
CREATE POLICY "Operator can read stock events"
  ON product_stock_events FOR SELECT TO authenticated
  USING (is_admin());

-- ── Replayability ────────────────────────────────────────────────────────────
-- IF NOT EXISTS throughout and DROP POLICY IF EXISTS before CREATE, so a second
-- run is a no-op. No data is written here — the scraper populates it.
--
-- ── Verify ───────────────────────────────────────────────────────────────────
--   SELECT event, count(*) FROM product_stock_events GROUP BY event;
-- Expect rows to start appearing within one sweep cycle (~2 min). 'first_seen'
-- fires for genuinely new listings only; 'in'/'out' only on real transitions, so
-- a quiet cycle legitimately writes nothing.
