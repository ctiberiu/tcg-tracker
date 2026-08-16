-- What the content bot published, when, and for which product. Owned by the bot,
-- not the radar — it records the bot's own output, never scraped data.
--
-- ── Why it gates everything ──────────────────────────────────────────────────
-- Every global posting rule in the Instagram spec is a query against this table,
-- so no template can post safely until it exists:
--   rate cap        max 4 posts/day, min 90 minutes apart
--   deduplication   same product + store cannot post twice within 72 hours,
--                   regardless of which template wants it
--   game rotation   never two consecutive posts from the same TCG unless the
--                   event score is at least 2x the next item in the queue
--   quiet hours     23:00-08:00 EET queues to the next morning slot
--
-- Unlike the transition log this one is not urgent — nothing is lost by adding it
-- later, because it only ever describes posts that have not happened yet. It is
-- here because it has no dependencies and is the other half of shipping T4.
--
-- ── Skips are recorded, not discarded ────────────────────────────────────────
-- The spec's failure mode is "if a required field is null the post is skipped and
-- logged — never rendered with an empty hole". A skip that leaves no trace is
-- indistinguishable from a template that never fired, which is exactly the
-- ambiguity that makes a broken renderer hard to notice. Hence status +
-- skip_reason rather than only writing successful posts.
--
-- ── product_url is nullable on purpose ───────────────────────────────────────
-- T6 (Weekly Sweep Report) is about the tool, not a product, so it has no product
-- to key on. The dedupe rule simply does not apply to those rows.

CREATE TABLE IF NOT EXISTS post_history (
  id          bigserial PRIMARY KEY,
  template_id text NOT NULL CHECK (template_id IN ('T1', 'T2', 'T3', 'T4', 'T5', 'T6')),
  status      text NOT NULL DEFAULT 'posted'
                CHECK (status IN ('queued', 'posted', 'skipped', 'failed')),
  posted_at   timestamptz NOT NULL DEFAULT now(),
  -- NULL for template-level posts with no single subject (T6).
  product_url text,
  store_name  text,
  game        text,
  surface     text CHECK (surface IS NULL OR surface IN ('feed', 'story')),
  -- Instagram's media id once published, for reconciling against the account.
  external_id text,
  -- Why a skipped/failed row exists. Free text: the renderer knows best.
  skip_reason text,
  -- utm_content carries the template id per the spec's link rule; stored so the
  -- posted link can be reconstructed without re-deriving it.
  utm_content text
);

COMMENT ON TABLE post_history IS
  'Content bot output log. Backs the rate cap, 72h dedupe, game rotation and quiet '
  'hours rules. Records skips and failures too — a silent skip is indistinguishable '
  'from a template that never fired.';

-- Rate cap and spacing: "posts in the last 24h", "most recent post".
CREATE INDEX IF NOT EXISTS idx_post_history_time ON post_history (posted_at DESC);
-- 72-hour dedupe on product + store.
CREATE INDEX IF NOT EXISTS idx_post_history_product ON post_history (product_url, store_name, posted_at DESC);
-- Rotation rule: what game did we post last.
CREATE INDEX IF NOT EXISTS idx_post_history_game ON post_history (game, posted_at DESC);

ALTER TABLE post_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operator can read post history" ON post_history;
CREATE POLICY "Operator can read post history"
  ON post_history FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Operator can write post history" ON post_history;
CREATE POLICY "Operator can write post history"
  ON post_history FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ── Replayability ────────────────────────────────────────────────────────────
-- IF NOT EXISTS throughout, DROP POLICY IF EXISTS before CREATE. Second run is a
-- no-op. No seed data — the bot populates it.
