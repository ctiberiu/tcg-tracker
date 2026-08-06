-- Add Disney Lorcana TCG listings for 11 stores we already scrape.
-- Same convention as migrations 025/026 — one store row per game.
-- Verified live: all 11 URLs return real Lorcana products as of 2026-07-23,
-- including Guildhall (its Cloudflare block — see task "investigate
-- Guildhall Cloudflare blocking" — appears intermittent, not constant).
INSERT INTO stores (name, url, scraper_type, game) VALUES
  ('Krit (Lorcana)',               'https://krit.ro/en/toate-produsele?page=1&sort=stocked&filters=categories_disney-lorcana', 'krit', 'lorcana'),
  ('LexShop (Lorcana)',            'https://www.lexshop.ro/disney-lorcana', 'pokemonia', 'lorcana'),
  ('TCGarena (Lorcana)',           'https://tcgarena.ro/collections/cartonase-disney-lorcana', 'shopify', 'lorcana'),
  ('RegatulJocurilor (Lorcana)',   'https://regatuljocurilor.ro/ro/cautare?controller=search&orderby=position&orderway=desc&search_query=lorcana&submit_search=', 'regatul_jocurilor', 'lorcana'),
  ('RamCards (Lorcana)',           'https://www.ramcards.ro/disney-lorcana-tcg', 'gomag', 'lorcana'),
  ('Hobby-Planet (Lorcana)',       'https://www.hobby-planet.ro/catalog/lorcana-281', 'hobby_planet', 'lorcana'),
  ('RedGoblin (Lorcana)',          'https://redgoblin.ro/collections/lorcana', 'shopify', 'lorcana'),
  ('Transylvania Games (Lorcana)', 'https://www.transylvaniagames.com/catalogsearch/result/?q=lorcana', 'magento', 'lorcana'),
  ('ATU-Toys (Lorcana)',           'https://www.atu-toys.ro/tcg/lorcana', 'opencart', 'lorcana'),
  ('Secret Cards (Lorcana)',       'https://secretcards.ro/categories/sealed-products?brand=lorcana&in_stock=&max_price=&min_price=&price_range=&promo=&sort=newest&subcategory=', 'secretcards_api', 'lorcana'),
  ('Guildhall (Lorcana)',          'https://shop.guildhall.ro/lorcana', 'pokemonia', 'lorcana');
