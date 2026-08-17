-- A scoped identity for the PostForge content bot, so it can read the transition
-- log and own post_history WITHOUT holding the service-role key.
--
-- ── The request, and why it was not granted as asked ─────────────────────────
-- PostForge connects with the anon key and correctly reported that
-- product_stock_events and post_history return HTTP 200 with [] rather than 403:
-- RLS filters rows, so "not permitted" and "nothing happened" are the same
-- response. Their weekly report would have published RESTOCKS CAUGHT - 0 to a
-- live account and raised nothing. That diagnosis is right and reproduced.
--
-- They asked for anon SELECT on the events table and anon READ + WRITE on
-- post_history. The read halves are defensible; the write half is not, and it is
-- the reason this migration exists instead.
--
-- VITE_SUPABASE_ANON_KEY is inlined into the client bundle at build time — it is
-- published to every visitor. Granting anon INSERT/UPDATE on post_history would
-- let anyone on the internet write the table that backs the rate cap (max 4
-- posts/day, 90 minutes apart) and the 72-hour product+store dedupe. Inserting
-- junk rows would satisfy both rules permanently and stop the account posting at
-- all: a denial of service on the Instagram account, through a public key. That
-- is a strictly worse version of the `FOR ALL TO authenticated USING (true)`
-- defect migration 033 exists to close, since 033 was only ever about
-- authenticated callers.
--
-- Handing over the service-role key was the other option offered and is also
-- declined: service_role bypasses RLS on EVERY table, including `subscribers`
-- (third-party email addresses — the one disclosure this system cannot undo, per
-- 033) and the snipe_* tables holding the operator's purchase automation. A
-- renderer that needs two tables should not receive the subscriber list.
--
-- ── The shape ────────────────────────────────────────────────────────────────
-- Deliberately identical to 033's admins/is_admin() pattern rather than a new
-- mechanism: a roster table, an invoker-rights predicate, a self-read policy so
-- the predicate resolves, and no write policy on the roster itself. Membership is
-- granted only through the SQL editor or service-role — a table governing who is
-- privileged must not be writable by the privilege it governs.
--
-- Two roles, not one, because their blast radii differ: is_admin() is the
-- operator and keeps everything it has; is_bot() is a machine identity scoped to
-- exactly the two tables PostForge named.

CREATE TABLE IF NOT EXISTS bots (
  user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE bots IS
  'Machine identities permitted to read product_stock_events and own post_history. '
  'Mirrors `admins`: no write policy, so membership is granted only via the SQL '
  'editor or service-role key.';

ALTER TABLE bots ENABLE ROW LEVEL SECURITY;

-- Self-read only, exactly as `admins` does. Without this policy RLS would hide
-- every row from the subquery in is_bot(), making it false for EVERYONE — the
-- lockout trap 033 documents. The policy and the function are one change.
DROP POLICY IF EXISTS "Bots can read their own row" ON bots;
CREATE POLICY "Bots can read their own row"
  ON bots FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Invoker-rights, matching is_admin(). Not SECURITY DEFINER: the self-read policy
-- above already makes EXISTS resolve correctly for both cases, and a definer
-- function here would add a privilege surface (and mandate search_path pinning)
-- for no benefit.
CREATE OR REPLACE FUNCTION is_bot()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM bots WHERE user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION is_bot() FROM public;
GRANT EXECUTE ON FUNCTION is_bot() TO authenticated;

-- Belt and braces, same reasoning as 033's grant on admins: if Supabase's default
-- privileges ever fail to cover this, is_bot() raises `permission denied for
-- table bots` on every policy evaluation — a total lockout rather than a false.
GRANT SELECT ON TABLE bots TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- product_stock_events — read only. The bot renders from it; the scraper writes
-- it with the service-role key and is unaffected by policies either way.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Operator can read stock events" ON product_stock_events;
CREATE POLICY "Operator or bot can read stock events"
  ON product_stock_events FOR SELECT TO authenticated
  USING (is_admin() OR is_bot());

-- Note the asymmetry: no INSERT policy for bots. The transition log is the
-- scraper's record of what it observed, and a renderer must never be able to
-- write history it then reports on.

-- ─────────────────────────────────────────────────────────────────────────────
-- post_history — the bot owns this outright. It is the bot's own output log, and
-- the rate cap, 90-minute spacing, 72h dedupe, rotation and quiet-hours rules are
-- all queries against it, so read WITHOUT write would leave every rule unable to
-- record what it just allowed.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Operator can read post history"  ON post_history;
DROP POLICY IF EXISTS "Operator can write post history" ON post_history;

CREATE POLICY "Operator or bot can read post history"
  ON post_history FOR SELECT TO authenticated
  USING (is_admin() OR is_bot());

CREATE POLICY "Operator or bot can write post history"
  ON post_history FOR ALL TO authenticated
  USING (is_admin() OR is_bot()) WITH CHECK (is_admin() OR is_bot());

-- ─────────────────────────────────────────────────────────────────────────────
-- template_id: drop the T1-T6 enum, keep a shape constraint.
--
-- PostForge has four templates of its own whose identifiers were not supplied, so
-- widening the enum would mean guessing them and shipping a CHECK that rejects
-- their first insert. A format constraint keeps the column meaningful (non-empty,
-- bounded, no whitespace surprises) without this migration having to know their
-- naming scheme. Tighten to an explicit list once the identifiers are known.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE post_history DROP CONSTRAINT IF EXISTS post_history_template_id_check;
ALTER TABLE post_history ADD CONSTRAINT post_history_template_id_check
  CHECK (template_id = btrim(template_id) AND length(template_id) BETWEEN 1 AND 32);

-- ─────────────────────────────────────────────────────────────────────────────
-- MANUAL STEP — this migration cannot complete the setup by itself.
--
-- No bot row is seeded here because no auth user exists yet, and signup is
-- DISABLED on this project (/auth/v1/settings reports disable_signup:true), so
-- PostForge cannot self-register. Creating auth users by INSERTing into
-- auth.users directly is fragile — password hashing and the identities table are
-- both involved — so it is deliberately not attempted in SQL.
--
-- The operator creates the user (Supabase dashboard -> Authentication -> Add
-- user, or the Admin API with the service-role key), then grants membership:
--
--   INSERT INTO bots (user_id, name)
--   VALUES ('<the new user uuid>', 'postforge')
--   ON CONFLICT (user_id) DO NOTHING;
--
-- PostForge then signs in with that account's credentials and uses the resulting
-- user JWT alongside the anon key. Until the row exists, is_bot() is false and
-- they will keep seeing [] — which is the correct closed-by-default state, not a
-- regression.
--
-- ── Replayability ────────────────────────────────────────────────────────────
-- CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS before every CREATE, DROP
-- CONSTRAINT IF EXISTS before ADD, CREATE OR REPLACE FUNCTION. A second run is a
-- no-op. Policies are dropped before creation for the reason 033 records: a
-- partial run that leaves a policy behind makes the retry die on 42710 and
-- silently strands the rest of the file.
--
-- ── Verify ───────────────────────────────────────────────────────────────────
--   -- as anon, BOTH must stay empty (anon was granted nothing here):
--   GET /rest/v1/product_stock_events  -> 200 []
--   GET /rest/v1/post_history          -> 200 []
--   -- as the bot's JWT, after the INSERT above:
--   GET /rest/v1/product_stock_events  -> rows
--   POST /rest/v1/post_history         -> 201
