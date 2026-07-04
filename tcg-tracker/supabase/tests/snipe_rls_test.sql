-- RLS isolation test for snipe_flows / snipe_tasks / snipe_runs (AC3).
-- Proves an authenticated user cannot read or write another user's rows.
--
-- Run against Supabase (wraps in a transaction and ROLLBACKs — no residue):
--   psql "$DATABASE_URL" -f supabase/tests/snipe_rls_test.sql
-- Also executed locally via the PGlite harness in the task's verification.
--
-- Assumes the Supabase auth schema exists (auth.users, auth.uid(), role
-- `authenticated`). The local harness creates a minimal shim first.

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

DO $$
DECLARE
  a uuid := '11111111-1111-1111-1111-111111111111';
  b uuid := '22222222-2222-2222-2222-222222222222';
  fa uuid;
  ta uuid;
  n  int;
  blocked boolean;
BEGIN
  -- ── Act as user A: create a flow + task + run ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO snipe_flows (payment_method) VALUES ('card') RETURNING id INTO fa;
  INSERT INTO snipe_tasks (flow_id, mode, url) VALUES (fa, 'link', 'https://krit.ro/produs/x') RETURNING id INTO ta;
  INSERT INTO snipe_runs (task_id, event) VALUES (ta, 'running');

  SELECT count(*) INTO n FROM snipe_flows;  ASSERT n = 1, 'A should see its own flow';
  ASSERT (SELECT user_id FROM snipe_flows WHERE id = fa) = a, 'user_id must default to auth.uid()';

  -- ── Switch to user B ──
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b)::text, true);
  SET LOCAL ROLE authenticated;

  -- B cannot READ any of A's rows.
  SELECT count(*) INTO n FROM snipe_flows;  ASSERT n = 0, 'B must not read A flows';
  SELECT count(*) INTO n FROM snipe_tasks;  ASSERT n = 0, 'B must not read A tasks';
  SELECT count(*) INTO n FROM snipe_runs;   ASSERT n = 0, 'B must not read A runs';

  -- B cannot UPDATE or DELETE A's rows (RLS filters them → 0 rows affected).
  UPDATE snipe_flows SET site = 'hacked' WHERE id = fa;
  GET DIAGNOSTICS n = ROW_COUNT;  ASSERT n = 0, 'B must not update A flow';
  DELETE FROM snipe_flows WHERE id = fa;
  GET DIAGNOSTICS n = ROW_COUNT;  ASSERT n = 0, 'B must not delete A flow';

  -- B cannot INSERT a row owned by A (WITH CHECK).
  blocked := false;
  BEGIN
    INSERT INTO snipe_flows (user_id, payment_method) VALUES (a, 'card');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    blocked := true;
  END;
  ASSERT blocked, 'B must not insert a flow owned by A';

  -- B CAN manage its own rows.
  INSERT INTO snipe_flows (payment_method) VALUES ('ramburs');
  SELECT count(*) INTO n FROM snipe_flows;  ASSERT n = 1, 'B sees only its own flow';

  RESET ROLE;
  RAISE NOTICE 'RLS isolation test PASSED';
END $$;

ROLLBACK;
