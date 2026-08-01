-- Close the open RLS on stores, scrape_runs and subscribers.
--
-- ── The defect ───────────────────────────────────────────────────────────────
-- All three carried `FOR ALL TO authenticated USING (true) WITH CHECK (true)`,
-- i.e. "any logged-in user may read and write every row". That was survivable
-- only while nobody could log in — but public signup is ENABLED on this project
-- (`/auth/v1/settings` reports disable_signup:false), and the anon key ships in
-- the client bundle. So the real exposure was: sign up, confirm with your own
-- inbox, and talk straight to PostgREST with the React route guard bypassed.
--
-- The three findings that came out of the audit were one missing control with
-- three symptoms: THERE WAS NO SERVER-SIDE NOTION OF "THE OPERATOR". The
-- single-user restriction this system is designed around lived entirely in
-- VITE_ALLOWED_EMAIL — present in three files under src/, and in zero files
-- under api/, supabase/ or scraper/. A VITE_ constant is inlined into the bundle
-- at build time, so it is shipped to every visitor and enforced nowhere the
-- server can see. That is why every policy said `TO authenticated` when it meant
-- "the operator", and why api/send-test-email.ts could check identity but never
-- permission — there was nothing to check permission AGAINST.
--
-- ── The fix ──────────────────────────────────────────────────────────────────
-- One predicate, applied in the three policies here and in the API gate.
--
-- A one-row `admins` table rather than a JWT-email predicate: it keeps an email
-- address out of policy DDL, it is data rather than schema when a second
-- operator appears, and `is_admin()` reads the same in every policy instead of a
-- string literal buried in a USING clause.
--
-- Deliberately NOT the snipe-style `auth.uid() = user_id` owner pattern
-- (016_create_snipe_tables.sql). These three tables are operator-global and have
-- no user_id, and there is exactly one operator. Per-user scoping is a problem
-- for whenever the accounts roadmap actually happens.
--
-- Deliberately NOT "only service_role may write": AdminPage manages stores
-- through the user's own JWT (useStores.ts:29,35,41 insert/update/delete via the
-- shared anon-key client), so that shape would have broken store management and
-- forced it server-side — far more change than this needs.
--
-- ── What is intentionally untouched ──────────────────────────────────────────
-- Migration 015's anon SELECT on `products` and `stores` STAYS. It is
-- load-bearing: `products` is the public Signal Log, and `stores` is read
-- anonymously by useSweepSummary for the landing-page health summary, precisely
-- because scrape_runs is authenticated-only. The columns anon can read are
-- operational config and failure state — no credentials, nothing a visitor could
-- not infer by opening the shops. Locking anon out would break / and /view.

-- ─────────────────────────────────────────────────────────────────────────────
-- admins
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- An admin may see the roster. Nobody can write it through PostgREST at all:
-- there is no INSERT/UPDATE/DELETE policy, so membership is granted only via the
-- SQL editor or the service-role key. That is deliberate — a table that governs
-- who is privileged must not be writable by the privilege it governs.
CREATE POLICY "Admins can read the admin list"
  ON admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Deliberately INVOKER-rights, not SECURITY DEFINER.
--
-- The obvious implementation is a definer function so the check bypasses admins'
-- own RLS. It is not needed here, and it would introduce this repo's first
-- definer function — a new privilege surface — for no benefit: the SELECT policy
-- above already makes the subquery resolve correctly for both cases. An admin
-- sees their own row, so EXISTS is true; a non-admin sees nothing, so it is
-- false. No recursion either, because admins' policy references only auth.uid()
-- and never touches stores/scrape_runs/subscribers.
--
-- The trap this avoids: with RLS enabled on admins and NO select policy, the
-- subquery would see zero rows and EXISTS would be false FOR EVERYONE — locking
-- the sole operator out of /admin, the store editor and the subscriber list at
-- once. The self-read policy and this function are the same change.
--
-- No search_path pinning, and that is consistent rather than sloppy: pinning
-- matters for DEFINER functions, where a caller-controlled search_path could
-- resolve `admins` to a table of their own. An invoker-rights function runs with
-- the caller's privileges either way, which is exactly why the set_updated_at()
-- finding was downgraded. If anyone later makes this SECURITY DEFINER, pinning
-- becomes mandatory.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION is_admin() FROM public;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Replace the three blanket policies
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage stores"      ON stores;
DROP POLICY IF EXISTS "Authenticated users can manage scrape_runs" ON scrape_runs;
DROP POLICY IF EXISTS "Authenticated users can manage subscribers" ON subscribers;

CREATE POLICY "Admins can manage stores"
  ON stores FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admins can manage scrape_runs"
  ON scrape_runs FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- subscribers is the only third-party PII in the system, and disclosure is the
-- one harm that cannot be undone. It is also the entry point of the attack
-- chain: WITH CHECK (true) let an attacker insert their own address, which then
-- satisfied send-test-email.ts's "is this address a subscriber" gate, yielding
-- attacker-chosen recipient + attacker-influenced content from the operator's
-- own mailbox. Closing this breaks that chain at step one.
CREATE POLICY "Admins can manage subscribers"
  ON subscribers FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Hygiene only. set_updated_at() is invoker-rights, so its unpinned search_path
-- never escalated anything — the backlog filed it twice as a privilege-escalation
-- vector and that framing was wrong. Pinned here because it costs nothing, NOT
-- because it was exploitable.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed the one existing operator.
--
-- ⚠️ THIS IS THE STEP THAT MATTERS ON APPLY. Until a row exists here, is_admin()
-- is false for everyone and the Admin UI cannot write stores or subscribers.
-- Replace the address if it differs from VITE_ALLOWED_EMAIL.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO admins (user_id, note)
SELECT id, 'seeded by migration 033 — original sole operator'
FROM auth.users
WHERE email = 'tiberiu.corici@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins) THEN
    RAISE WARNING 'admins is EMPTY — is_admin() is false for everyone, so the Admin UI cannot write stores/subscribers. Insert the operator''s auth.users id before relying on this.';
  END IF;
END $$;
