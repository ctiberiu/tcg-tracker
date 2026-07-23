-- Add 4 new Pokémon TCG stores. Guildhall (the 5th store from the same batch)
-- was already in the table (see migration 008) — no action needed there.
-- Verified live: all 4 URLs return real Pokémon products as of 2026-07-23.
INSERT INTO stores (name, url, scraper_type, game) VALUES
  ('Transylvania Games', 'https://www.transylvaniagames.com/card-games/pokemon', 'magento', 'pokemon'),
  ('Arcana Inn',          'https://arcanainn.ro/collections/pokemon',            'shopify', 'pokemon'),
  ('ATU-Toys',            'https://www.atu-toys.ro/tcg/pokemon',                 'opencart', 'pokemon'),
  ('Secret Cards',        'https://secretcards.ro/categories/sealed-products?brand=pokemon&in_stock=&max_price=&min_price=&price_range=&promo=&sort=newest&subcategory=', 'secretcards_api', 'pokemon');
