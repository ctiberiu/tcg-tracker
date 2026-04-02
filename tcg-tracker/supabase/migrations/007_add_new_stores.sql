-- Add UNIQUE constraint on stores.url to prevent duplicate entries
ALTER TABLE stores ADD CONSTRAINT stores_url_unique UNIQUE (url);

-- Add new Romanian TCG stores for scraping
-- Stores that already exist: Pokemonia, RedGoblin, TCGarena, Hobby-Planet, RegatulJocurilor

INSERT INTO stores (name, url, scraper_type) VALUES
  ('Krit',             'https://krit.ro/toate-produsele?page=1&sort=new&filters=categories_pokemon',           'krit'),
  ('Smyk',             'https://smyk.ro/search?limit=84&q=pokemon%20tcg',                                     'smyk'),
  ('Noriel',           'https://noriel.ro/catalogsearch/result/?q=pokemon+tcg',                                'magento'),
  ('Carrefour',        'https://carrefour.ro/catalogsearch/result/?q=pokemon+tcg',                             'magento'),
  ('DexHit',           'https://dexhit.ro/product-category/pokemon-tcg-en/',                                   'woocommerce'),
  ('Ozone',            'https://www.ozone.ro/instantsearchplus/result/?q=pokemon+tcg',                         'ozone'),
  ('LumeaJocurilor',   'https://www.lumea-jocurilor.ro/cautare?q=pokemon%20tcg',                               'lumea_jocurilor'),
  ('Guildhall',        'https://shop.guildhall.ro/pokemon/s-instock',                                          'shopify'),
  ('Tulli',            'https://www.tulli.ro/search?keyword=pokemon+tcg',                                      'tulli'),
  ('RaiJucarii',       'https://www.raijucarii.ro/vyhladavanie?search=pokemon%20tcg',                          'raijucarii'),
  ('BookCity',         'https://www.bookcity.ro/search/pokemon+tcg',                                           'magento'),
  ('LexShop',          'https://www.lexshop.ro/produse?c=pokemon+tcg',                                         'pokemonia'),
  ('LibHumanitas',     'https://www.libhumanitas.ro/catalogsearch/result/?q=pokemon+tcg',                      'magento')
ON CONFLICT (url) DO NOTHING;

-- Foon.ro is an electronics store, not TCG — insert disabled
INSERT INTO stores (name, url, scraper_type, is_enabled) VALUES
  ('Foon',             'https://foon.ro/katalog?q=pokemon+tcg',                                                'krit', false)
ON CONFLICT (url) DO NOTHING;
