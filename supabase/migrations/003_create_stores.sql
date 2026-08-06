-- Stores table: replaces hardcoded STORES array in scraper.js
-- Admin can manage which stores to scrape from the UI
CREATE TABLE stores (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  url                   text NOT NULL,
  scraper_type          text NOT NULL,  -- 'pokemonia' | 'shopify' | 'hobby_planet' | 'regatul_jocurilor'
  is_enabled            boolean NOT NULL DEFAULT true,
  in_stock_selector     text,           -- CSS selector for "add to cart" button
  out_of_stock_selector text,           -- CSS selector for "out of stock" indicator
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage stores"
  ON stores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed the 5 existing stores
INSERT INTO stores (name, url, scraper_type) VALUES
  ('Pokemonia',        'https://www.pokemonia.ro/produse-1',                                          'pokemonia'),
  ('RedGoblin',        'https://redgoblin.ro/collections/pokemon',                                    'shopify'),
  ('TCGarena',         'https://tcgarena.ro/collections/joc-de-carti-pokemon-tcg-romania',            'shopify'),
  ('Hobby-Planet',     'https://www.hobby-planet.ro/catalog/q/Pokemon',                               'hobby_planet'),
  ('RegatulJocurilor', 'https://regatuljocurilor.ro/ro/cautare?controller=search&s=pokemon',          'regatul_jocurilor');
