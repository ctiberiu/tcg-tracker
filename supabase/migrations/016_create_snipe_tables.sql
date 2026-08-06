-- Snipe auto-purchase bot — per-user config + audit persistence (Phase 4).
-- Three tables, all scoped to the authenticated user via RLS (owner-only).
-- Unlike the single-user products/stores tables, these are per-user: every row
-- carries user_id (defaulting to auth.uid()) and RLS restricts access to the owner.
-- See docs/snipe-bot-plan.md §4.

-- Auto-maintain updated_at on UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- snipe_flows — a per-store checkout "flow" (krit.ro only for now).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE snipe_flows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  site            text NOT NULL DEFAULT 'krit.ro',
  payment_method  text NOT NULL CHECK (payment_method IN ('ramburs', 'card')),
  shipping_method text,
  address         text,  -- NULL = use the account's saved default address
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- snipe_tasks — what to buy (Mode A link or Mode B keywords) under a flow.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE snipe_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  flow_id        uuid NOT NULL REFERENCES snipe_flows (id) ON DELETE CASCADE,
  mode           text NOT NULL CHECK (mode IN ('link', 'keywords')),
  url            text,        -- Mode A (link)
  keywords       text[],      -- Mode B (keywords)
  desired_qty    integer NOT NULL DEFAULT 1 CHECK (desired_qty > 0),
  respect_limit  boolean NOT NULL DEFAULT true,
  max_price      numeric CHECK (max_price IS NULL OR max_price > 0),
  status         text NOT NULL DEFAULT 'idle'
                   CHECK (status IN ('idle', 'running', 'grabbed', 'awaiting_payment', 'ordered', 'failed')),
  check_interval integer NOT NULL DEFAULT 10 CHECK (check_interval > 0),  -- seconds (~10s + jitter)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- The target must match the mode: link ⇒ url, keywords ⇒ non-empty keywords[].
  CONSTRAINT snipe_tasks_target_matches_mode CHECK (
    (mode = 'link'     AND url IS NOT NULL) OR
    (mode = 'keywords' AND keywords IS NOT NULL AND array_length(keywords, 1) >= 1)
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- snipe_runs — append-only audit log of what a task did (status changes, caps…).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE snipe_runs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  task_id    uuid NOT NULL REFERENCES snipe_tasks (id) ON DELETE CASCADE,
  event      text NOT NULL,  -- e.g. running | grabbed | awaiting_payment | ordered | failed | quantity_capped | backoff
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes: RLS filters on user_id; the dashboard queries by owner/flow/task/status.
CREATE INDEX idx_snipe_flows_user   ON snipe_flows (user_id);
CREATE INDEX idx_snipe_tasks_user   ON snipe_tasks (user_id);
CREATE INDEX idx_snipe_tasks_flow   ON snipe_tasks (flow_id);
CREATE INDEX idx_snipe_tasks_status ON snipe_tasks (status);
CREATE INDEX idx_snipe_runs_user    ON snipe_runs (user_id);
CREATE INDEX idx_snipe_runs_task    ON snipe_runs (task_id, created_at DESC);

CREATE TRIGGER trg_snipe_flows_updated_at BEFORE UPDATE ON snipe_flows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_snipe_tasks_updated_at BEFORE UPDATE ON snipe_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security — owner-only on every table (read + write).
-- auth.uid() is the authenticated user's id; user_id defaults to it on insert,
-- and WITH CHECK prevents inserting/updating rows owned by anyone else.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE snipe_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE snipe_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE snipe_runs  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage own snipe_flows"
  ON snipe_flows FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner can manage own snipe_tasks"
  ON snipe_tasks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner can manage own snipe_runs"
  ON snipe_runs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
