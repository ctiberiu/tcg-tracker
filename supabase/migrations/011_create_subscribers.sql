-- Subscribers table: email recipients for new-product alerts.
-- Kept in Supabase (not in the public repo) so addresses are never exposed.
-- For now, add/remove recipients manually via the Supabase dashboard.
CREATE TABLE subscribers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage subscribers"
  ON subscribers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed your own address here, or add via the dashboard:
-- INSERT INTO subscribers (email) VALUES ('you@example.com');
