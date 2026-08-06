-- Add BebeTei store for scraping
INSERT INTO stores (name, url, scraper_type) VALUES
  ('BebeTei', 'https://comenzi.bebetei.ro/cauti/pokemon%20tcg', 'bebetei')
ON CONFLICT (url) DO NOTHING;
