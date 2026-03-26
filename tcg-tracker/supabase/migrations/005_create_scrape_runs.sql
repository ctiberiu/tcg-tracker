-- Track individual scrape runs for manual scraping UI
CREATE TABLE scrape_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid REFERENCES stores(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending',  -- 'pending' | 'running' | 'completed' | 'failed'
  products_found  int,
  products_new    int,
  error_message   text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage scrape_runs"
  ON scrape_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
