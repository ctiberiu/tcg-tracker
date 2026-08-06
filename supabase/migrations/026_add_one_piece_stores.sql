-- Add One Piece TCG listings for 9 stores we already scrape for Pokémon.
-- Each game gets its own store row (same convention as migration 025) so a
-- single physical store can carry multiple games without conflating them.
-- Guildhall is skipped here — its One Piece page hits the same Cloudflare
-- challenge wall as its existing Pokémon listing (see task: "Guildhall:
-- investigate Cloudflare blocking"); add it once that's resolved.
-- Verified live: all 9 URLs return real One Piece products as of 2026-07-23.
INSERT INTO stores (name, url, scraper_type, game) VALUES
  ('Krit (One Piece)',               'https://krit.ro/en/toate-produsele?page=1&sort=stocked&filters=categories_one-piece', 'krit', 'one_piece'),
  ('LexShop (One Piece)',            'https://www.lexshop.ro/one-piece-card-game', 'pokemonia', 'one_piece'),
  ('RedGoblin (One Piece)',          'https://redgoblin.ro/collections/one-piece', 'shopify', 'one_piece'),
  ('TCGarena (One Piece)',           'https://tcgarena.ro/collections/cartonase-one-piece', 'shopify', 'one_piece'),
  ('RegatulJocurilor (One Piece)',   'https://regatuljocurilor.ro/ro/cautare?controller=search&orderby=position&orderway=desc&search_query=one+piece&submit_search=', 'regatul_jocurilor', 'one_piece'),
  ('RamCards (One Piece)',           'https://www.ramcards.ro/one-piece-tcg', 'gomag', 'one_piece'),
  ('Hobby-Planet (One Piece)',       'https://www.hobby-planet.ro/catalog/one-piece-267', 'hobby_planet', 'one_piece'),
  ('Transylvania Games (One Piece)', 'https://www.transylvaniagames.com/catalogsearch/result/?q=one+piece', 'magento', 'one_piece'),
  ('ATU-Toys (One Piece)',           'https://www.atu-toys.ro/tcg/one-piece-ro', 'opencart', 'one_piece');
