-- Web Push subscriptions — the anonymous, account-free alert channel.
--
-- ── Why this is not `subscribers` with a different column ────────────────────
-- `subscribers` (011) is an operator-curated list of EMAIL ADDRESSES, added by
-- hand on /admin. Every row is third-party PII and migration 033 calls it "the
-- one disclosure this system cannot undo". This table is the opposite shape on
-- every axis and deliberately does not extend it:
--
--   subscribers            push_subscriptions
--   ─────────────────      ──────────────────────────────────────────────
--   an email address       a browser endpoint URL, no person attached
--   operator adds it       the visitor creates it themselves, no signup
--   costs ZeptoMail        costs nothing
--   one row per human      one row per DEVICE (a person can have several)
--
-- The endpoint is not merely an identifier, it is a CAPABILITY: anyone holding
-- it can push that device. That single fact drives every access decision below.
--
-- ── Access model: anon touches this table only through functions ─────────────
-- There are no anon table policies at all — not SELECT, not INSERT, not UPDATE,
-- not DELETE. Three SECURITY DEFINER functions are the entire public surface.
--
-- SELECT is the one that must never exist. If anon could read a row it could
-- read an endpoint, and an endpoint is enough to push that device. The whole
-- table would become a list of "phones you may send notifications to". This is
-- the same class of defect 033 closed on `subscribers` and 039 refused to open
-- on `post_history`, and it is worse here because the leaked value is directly
-- actionable by the reader without any further access.
--
-- INSERT-by-policy is avoided for a subtler reason: re-subscribing is an UPSERT
-- (the browser hands back the SAME endpoint when a device re-enables), and
-- granting anon the UPDATE needed for that would also let anyone repoint any
-- row's `games` — or its keys — given only an endpoint. Routing everything
-- through functions lets each one do exactly one thing.
--
-- The endpoint doubles as the bearer secret for the caller's own row: it is
-- long, random and never readable from this table, so "knows the endpoint" is a
-- sound proxy for "is that device". This is why unsubscribe takes the full
-- endpoint and never an id.
--
-- ── The scraper is unaffected by all of this ─────────────────────────────────
-- It connects with the service-role key, which bypasses RLS. The policies here
-- govern the browser only. Same arrangement as 037.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The push service URL. UNIQUE because it IS the device identity: the browser
  -- returns the same value for the same installation, so re-subscribing must
  -- update in place rather than accumulate duplicate rows that all deliver to
  -- one phone.
  endpoint      text NOT NULL UNIQUE,
  -- The two halves of the message-encryption keypair, from
  -- PushSubscription.getKey(). Without both, web-push cannot encrypt a payload.
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  -- Which games this device wants. Checked with `<@` (array containment) against
  -- the same list migrations 023 and 028 apply to stores.game / products.game.
  -- ADDING A GAME MEANS EDITING THREE CHECKS, and this is the third.
  --
  -- At least one element is required. A zero-length array would be a silent
  -- "subscribed to nothing" — a row that looks live, is counted as a subscriber,
  -- and can never produce a notification. Deselecting everything is an
  -- UNSUBSCRIBE and must delete the row, which is why that state is unstorable.
  games         text[] NOT NULL,
  -- Free-text, for working out why a platform misbehaves. Deliberately NOT
  -- parsed or matched on: it is a debugging aid, and treating it as a key would
  -- make it load-bearing.
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Last time a push to this endpoint was ACCEPTED by the push service. Not
  -- "was read" — web push gives no delivery receipt, and pretending otherwise
  -- would invite a "last active" number that is not one.
  last_success_at timestamptz,
  -- Consecutive transient failures. A 404/410 is not counted here because it is
  -- terminal and deletes the row outright; this exists for the 5xx/timeout case
  -- where the right response is to retry later, not to forget the device.
  failure_count int NOT NULL DEFAULT 0,
  last_error    text,

  CONSTRAINT push_subscriptions_games_valid CHECK (
    cardinality(games) BETWEEN 1 AND 10
    AND games <@ ARRAY[
      'pokemon', 'magic', 'lorcana', 'yugioh', 'digimon',
      'one_piece', 'duel_masters', 'dragon_ball_super', 'weiss_schwarz', 'riftbound'
    ]::text[]
  ),

  -- Shape gate on the endpoint. Anon can create rows here without an account, so
  -- without this the table is writable free-form storage for anyone on the
  -- internet, and the scraper would spend a failing HTTP request per junk row on
  -- every sweep.
  --
  -- The host list is the real constraint and it is the thing most likely to need
  -- editing: these are the push services the browsers actually use. If a
  -- platform ships a new host, subscriptions from it are REJECTED AT SIGNUP and
  -- the symptom is "enabling notifications silently does nothing on <browser>".
  -- Extend the list here; do not work around it in the client.
  --   web.push.apple.com          Safari / iOS (the one that matters first here)
  --   fcm.googleapis.com          Chrome, Edge, and Chromium derivatives
  --   *.push.services.mozilla.com Firefox
  --   *.notify.windows.com        legacy Edge / Windows
  CONSTRAINT push_subscriptions_endpoint_shape CHECK (
    length(endpoint) BETWEEN 20 AND 1000
    AND endpoint ~ '^https://[a-z0-9.-]+\.(apple\.com|googleapis\.com|mozilla\.com|windows\.com)/'
  )
);

COMMENT ON TABLE push_subscriptions IS
  'Anonymous Web Push endpoints, one row per device. No account, no email, no PII. '
  'The endpoint is a capability (holding it lets you push that device), so anon has '
  'NO table policies whatsoever — all access is via the three SECURITY DEFINER '
  'functions below, each keyed on the endpoint as its own bearer secret.';

-- The send path is "every subscription wanting game X". GIN over the array is
-- what makes that an index scan rather than a full table read on every sweep.
CREATE INDEX IF NOT EXISTS idx_push_subs_games ON push_subscriptions USING gin (games);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- The ONLY policy on this table. Operator-only reads, matching 033's shape.
-- There is intentionally no anon policy of any kind: with RLS enabled and no
-- policy that admits them, anon is denied by default, which is the desired
-- state. The functions below are SECURITY DEFINER and so are unaffected.
DROP POLICY IF EXISTS "Operator can read push subscriptions" ON push_subscriptions;
CREATE POLICY "Operator can read push subscriptions"
  ON push_subscriptions FOR SELECT TO authenticated
  USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Public surface: three functions, each doing exactly one thing.
--
-- All are SECURITY DEFINER with a pinned search_path. The pin is not optional —
-- an unpinned definer function can be hijacked by a caller-controlled
-- search_path resolving `push_subscriptions` to some other table. 039's is_bot()
-- could skip this only because it is invoker-rights; these cannot.
-- ─────────────────────────────────────────────────────────────────────────────

-- Subscribe, or update an existing device's game selection / rotated keys.
--
-- ON CONFLICT rather than a read-then-write: the browser hands back the same
-- endpoint every time a device re-enables notifications, and two tabs doing this
-- at once must not race into a duplicate-key error the user sees as "enabling
-- failed".
--
-- Keys are refreshed on conflict because a browser MAY rotate them while keeping
-- the endpoint. Keeping the stale pair would encrypt payloads the device cannot
-- open — a subscription that reports healthy and delivers nothing.
--
-- failure_count resets to 0: a device that just re-subscribed is by definition
-- reachable, and carrying the old count forward would let historical failures
-- prune a live subscription.
CREATE OR REPLACE FUNCTION upsert_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_games      text[],
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO push_subscriptions (endpoint, p256dh, auth, games, user_agent)
  VALUES (p_endpoint, p_p256dh, p_auth, p_games, left(p_user_agent, 400))
  ON CONFLICT (endpoint) DO UPDATE SET
    p256dh        = EXCLUDED.p256dh,
    auth          = EXCLUDED.auth,
    games         = EXCLUDED.games,
    user_agent    = EXCLUDED.user_agent,
    updated_at    = now(),
    failure_count = 0,
    last_error    = NULL;
$$;

-- Unsubscribe. Idempotent by construction — deleting an endpoint that is already
-- gone is a no-op, which is the common case when a browser drops a subscription
-- and the page tries to clean up after it.
--
-- Returns void, NOT a deleted-row count. A count would answer "does this endpoint
-- exist?" for any caller, turning the function into the existence oracle that
-- withholding SELECT exists to prevent.
CREATE OR REPLACE FUNCTION delete_push_subscription(p_endpoint text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM push_subscriptions WHERE endpoint = p_endpoint;
$$;

-- Read back one device's own game selection, so a returning visitor sees their
-- real checkboxes instead of a reset default.
--
-- Returns ONLY the games array — never the endpoint, keys, or any other row.
-- Callers must already hold the endpoint to ask, so this discloses nothing they
-- did not have. An unknown endpoint returns NULL, which the client treats as
-- "not subscribed on this device".
CREATE OR REPLACE FUNCTION get_push_subscription_games(p_endpoint text)
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT games FROM push_subscriptions WHERE endpoint = p_endpoint;
$$;

-- Anon is the point: these are called by visitors with no account. `authenticated`
-- is granted too so the operator's own logged-in browser can subscribe like any
-- other device rather than needing a separate path.
REVOKE ALL ON FUNCTION upsert_push_subscription(text, text, text, text[], text) FROM public;
REVOKE ALL ON FUNCTION delete_push_subscription(text) FROM public;
REVOKE ALL ON FUNCTION get_push_subscription_games(text) FROM public;

GRANT EXECUTE ON FUNCTION upsert_push_subscription(text, text, text, text[], text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_push_subscription(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_push_subscription_games(text) TO anon, authenticated;

-- ── Replayability ────────────────────────────────────────────────────────────
-- CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS
-- before CREATE POLICY, and CREATE OR REPLACE for all three functions. A second
-- run is a no-op and no data is written.
--
-- One replay caveat worth knowing: the CHECK constraints are attached in CREATE
-- TABLE, so re-running does NOT update them on an existing table. Changing the
-- game list or the endpoint host list means a new migration with
-- ALTER TABLE ... DROP CONSTRAINT IF EXISTS / ADD CONSTRAINT, in the style 039
-- used for post_history_template_id_check. Editing this file after it has been
-- applied changes nothing in the database.
--
-- ── Verify ───────────────────────────────────────────────────────────────────
--   -- as anon, both must fail: the table is unreachable except via the functions
--   SELECT * FROM push_subscriptions;                       -- expect 0 rows (RLS)
--   INSERT INTO push_subscriptions (endpoint) VALUES ('x'); -- expect permission denied
--
--   -- the shape gate rejects junk
--   SELECT upsert_push_subscription('not-a-url', 'k', 'a', ARRAY['pokemon']);
--   -- expect: violates check constraint "push_subscriptions_endpoint_shape"
--
--   -- and an empty selection is unstorable
--   SELECT upsert_push_subscription(
--     'https://web.push.apple.com/'||repeat('a',40), 'k', 'a', ARRAY[]::text[]);
--   -- expect: violates check constraint "push_subscriptions_games_valid"
--
--   -- as the operator
--   SELECT count(*), games FROM push_subscriptions GROUP BY games;
