-- RLS test for migration 033 — operator-only access to stores, scrape_runs and
-- subscribers.
--
-- Run against Supabase (wraps in a transaction and ROLLBACKs — no residue):
--   psql "$DATABASE_URL" -f supabase/tests/operator_rls_test.sql
--
-- Follows supabase/tests/snipe_rls_test.sql, which is the precedent for both the
-- pattern and the technique (set_config on request.jwt.claims + SET LOCAL ROLE,
-- inside a transaction that rolls back).
--
-- ── Why the NEGATIVE cases are the point ─────────────────────────────────────
-- A policy test that only proves "the admin can reach their data" passes just as
-- happily against the over-permissive policy this migration replaces. The
-- assertions that actually discriminate are:
--
--   * a non-admin authenticated user cannot read or write subscribers
--   * a non-admin authenticated user cannot write stores
--   * anon cannot reach subscribers at all
--
-- Those three are the reason the migration exists. The positive cases only prove
-- it did not overshoot and break the Admin UI.

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'operator@test.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'attacker@test.local');

-- Only the operator is an admin. The attacker is a perfectly ordinary
-- authenticated user — which, with public signup enabled, anyone can become.
INSERT INTO admins (user_id, note) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test operator');

DO $$
DECLARE
  operator uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  attacker uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  n         int;
  blocked   boolean;
  store_id  uuid;
BEGIN
  -- ── Seed as the table owner, bypassing RLS ────────────────────────────────
  INSERT INTO stores (name, url, scraper_type)
    VALUES ('TestShop', 'https://test.local/x', 'shopify')
    RETURNING id INTO store_id;
  INSERT INTO subscribers (email) VALUES ('real-subscriber@test.local');

  -- ═══════════════════════════════════════════════════════════════════════════
  -- NEGATIVE — a non-admin authenticated user. This is the attacker with a
  -- self-registered account, and every assertion here failed before 033.
  -- ═══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims', json_build_object('sub', attacker)::text, true);
  SET LOCAL ROLE authenticated;

  ASSERT NOT is_admin(), 'a self-registered user must not be an admin';

  -- The PII. Previously readable in full via GET /rest/v1/subscribers.
  SELECT count(*) INTO n FROM subscribers;
  ASSERT n = 0, 'non-admin must not READ subscribers';

  -- Inserting their own address was step one of the chain into send-test-email.
  blocked := false;
  BEGIN
    INSERT INTO subscribers (email) VALUES ('attacker@evil.local');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    blocked := true;
  END;
  ASSERT blocked, 'non-admin must not INSERT into subscribers';

  DELETE FROM subscribers;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'non-admin must not DELETE subscribers';

  -- stores: anon SELECT is intentional and stays (migration 015), so a read here
  -- SUCCEEDING is correct and expected. Writes are what must be refused.
  UPDATE stores SET url = 'https://attacker.local/ssrf' WHERE id = store_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'non-admin must not UPDATE stores (this is the SSRF primitive)';

  DELETE FROM stores WHERE id = store_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'non-admin must not DELETE stores';

  blocked := false;
  BEGIN
    INSERT INTO stores (name, url, scraper_type) VALUES ('Rogue', 'https://evil.local', 'shopify');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    blocked := true;
  END;
  ASSERT blocked, 'non-admin must not INSERT stores';

  SELECT count(*) INTO n FROM scrape_runs;
  ASSERT n = 0, 'non-admin must not READ scrape_runs';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- NEGATIVE — anon. The role the anon key in the client bundle carries before
  -- anyone even signs up.
  -- ═══════════════════════════════════════════════════════════════════════════
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SET LOCAL ROLE anon;

  SELECT count(*) INTO n FROM subscribers;
  ASSERT n = 0, 'anon must not READ subscribers';

  SELECT count(*) INTO n FROM scrape_runs;
  ASSERT n = 0, 'anon must not READ scrape_runs';

  -- These two anon reads MUST succeed: migration 015 grants them deliberately and
  -- the public Signal Log and landing-page summary depend on them. Asserting the
  -- positive here stops a future "lock down anon" change from silently breaking
  -- / and /view.
  SELECT count(*) INTO n FROM stores;
  ASSERT n >= 1, 'anon MUST still read stores — useSweepSummary depends on it';
  PERFORM 1 FROM products LIMIT 1;  -- must not raise

  blocked := false;
  BEGIN
    INSERT INTO stores (name, url, scraper_type) VALUES ('AnonRogue', 'https://evil.local', 'shopify');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    blocked := true;
  END;
  ASSERT blocked, 'anon must not INSERT stores';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- POSITIVE — the operator. Proves 033 did not overshoot and break AdminPage,
  -- which writes stores through the user's own JWT (useStores.ts:29,35,41).
  -- ═══════════════════════════════════════════════════════════════════════════
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', operator)::text, true);
  SET LOCAL ROLE authenticated;

  ASSERT is_admin(), 'the seeded operator must be an admin';

  SELECT count(*) INTO n FROM subscribers;
  ASSERT n = 1, 'operator must READ subscribers';

  INSERT INTO subscribers (email) VALUES ('added-by-operator@test.local');
  UPDATE stores SET url = 'https://test.local/updated' WHERE id = store_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'operator must UPDATE stores (AdminPage depends on it)';

  INSERT INTO stores (name, url, scraper_type) VALUES ('OperatorShop', 'https://ok.local', 'shopify');
  DELETE FROM stores WHERE name = 'OperatorShop';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'operator must DELETE stores';

  -- The admins roster itself must not be writable through PostgREST, even by an
  -- admin: a table that decides who is privileged must not be editable by the
  -- privilege it grants. There is no INSERT policy, so this must fail.
  blocked := false;
  BEGIN
    INSERT INTO admins (user_id) VALUES (attacker);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    blocked := true;
  END;
  ASSERT blocked, 'even an admin must not grant admin via PostgREST';

  RESET ROLE;
  RAISE NOTICE 'Operator RLS test PASSED';
END $$;

ROLLBACK;
