-- Per-task "watch until stopped" opt-in (feature).
-- When true, the extension watch loop ignores the consecutive-error give-up limit
-- and keeps backing off (still capped at 5 min/attempt) until the user stops it or
-- a hard 24h safety cap (enforced in the watch loop, not the DB) auto-stops it.
-- Existing tasks default to false → behavior unchanged. No RLS change needed: the
-- owner-only FOR ALL policy on snipe_tasks already covers every column.
ALTER TABLE snipe_tasks
  ADD COLUMN watch_until_stopped boolean NOT NULL DEFAULT false;
