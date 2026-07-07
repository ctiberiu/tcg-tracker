-- Add Flamey store for scraping (flamey_api scraper_type — see scraper.js scrapeFlameyApi)
INSERT INTO stores (name, url, scraper_type) VALUES
  ('Flamey', 'https://shop.flamey.ro/shop/trading-card-game/pokemon-tcg', 'flamey_api')
ON CONFLICT (url) DO NOTHING;
