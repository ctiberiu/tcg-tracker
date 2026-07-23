-- Add 'riftbound' (Riot Games' League of Legends TCG) to the allowed game
-- list, then add store rows for Yu-Gi-Oh!, Duel Masters, Digimon, Dragon
-- Ball Super, Weiss Schwarz, and Riftbound across the stores we already
-- scrape. Postgres' default name for an inline CHECK added via ADD COLUMN
-- is "<table>_<column>_check" — that's what migration 023 produced.
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_game_check;
ALTER TABLE stores ADD CONSTRAINT stores_game_check
  CHECK (game IN ('pokemon', 'magic', 'lorcana', 'yugioh', 'digimon', 'one_piece', 'duel_masters', 'dragon_ball_super', 'weiss_schwarz', 'riftbound'));

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_game_check;
ALTER TABLE products ADD CONSTRAINT products_game_check
  CHECK (game IN ('pokemon', 'magic', 'lorcana', 'yugioh', 'digimon', 'one_piece', 'duel_masters', 'dragon_ball_super', 'weiss_schwarz', 'riftbound'));

-- Yu-Gi-Oh!
INSERT INTO stores (name, url, scraper_type, game) VALUES
  ('Krit (Yu-Gi-Oh!)',               'https://krit.ro/en/categorie/yu-gi-oh', 'krit', 'yugioh'),
  ('LexShop (Yu-Gi-Oh!)',            'https://www.lexshop.ro/yu-gi-oh-167', 'pokemonia', 'yugioh'),
  -- LexShop splits Yu-Gi-Oh into two non-overlapping subcategories (167 =
  -- boosters/packs, 173 = structure decks/tins/boxes) — both needed for
  -- full coverage, verified live to have zero overlapping products. Same
  -- name as the row above on purpose: the store-page dedup (storeName.ts)
  -- groups by exact name, and both rows ARE the same physical store+game.
  ('LexShop (Yu-Gi-Oh!)',            'https://www.lexshop.ro/yu-gi-oh-173', 'pokemonia', 'yugioh'),
  ('RedGoblin (Yu-Gi-Oh!)',          'https://redgoblin.ro/collections/yu-gi-oh', 'shopify', 'yugioh'),
  ('TCGarena (Yu-Gi-Oh!)',           'https://tcgarena.ro/collections/cartonase-yugioh', 'shopify', 'yugioh'),
  ('RegatulJocurilor (Yu-Gi-Oh!)',   'https://regatuljocurilor.ro/ro/cautare?controller=search&orderby=position&orderway=desc&search_query=yugioh&submit_search=', 'regatul_jocurilor', 'yugioh'),
  ('RamCards (Yu-Gi-Oh!)',           'https://www.ramcards.ro/yu-gi-oh-tcg', 'gomag', 'yugioh'),
  ('Hobby-Planet (Yu-Gi-Oh!)',       'https://www.hobby-planet.ro/catalog/yu-gi-oh-262', 'hobby_planet', 'yugioh'),
  ('Transylvania Games (Yu-Gi-Oh!)', 'https://www.transylvaniagames.com/card-games/yu-gi-oh', 'magento', 'yugioh'),
  ('ATU-Toys (Yu-Gi-Oh!)',           'https://www.atu-toys.ro/tcg/yu-gi-oh', 'opencart', 'yugioh'),
  ('Guildhall (Yu-Gi-Oh!)',          'https://shop.guildhall.ro/yu-gi-oh', 'pokemonia', 'yugioh');

-- Duel Masters
INSERT INTO stores (name, url, scraper_type, game) VALUES
  ('Krit (Duel Masters)', 'https://krit.ro/en/toate-produsele?page=1&sort=stocked&filters=categories_alte-tcgs', 'krit', 'duel_masters');

-- Digimon
INSERT INTO stores (name, url, scraper_type, game) VALUES
  ('Krit (Digimon)',               'https://krit.ro/en/toate-produsele?page=1&sort=stocked&filters=categories_digimon-card-game', 'krit', 'digimon'),
  ('LexShop (Digimon)',            'https://www.lexshop.ro/digimon-card-game', 'pokemonia', 'digimon'),
  ('TCGarena (Digimon)',           'https://tcgarena.ro/collections/cartonase-digimon', 'shopify', 'digimon'),
  ('RegatulJocurilor (Digimon)',   'https://regatuljocurilor.ro/ro/cautare?controller=search&orderby=position&orderway=desc&search_query=digimon&submit_search=', 'regatul_jocurilor', 'digimon'),
  ('Carturesti (Digimon)',         'https://carturesti.ro/product/search/digimon', 'carturesti', 'digimon'),
  ('RamCards (Digimon)',           'https://www.ramcards.ro/digimon-tcg', 'gomag', 'digimon'),
  ('Hobby-Planet (Digimon)',       'https://www.hobby-planet.ro/catalog/digimon-tcg-236', 'hobby_planet', 'digimon'),
  ('Transylvania Games (Digimon)', 'https://www.transylvaniagames.com/card-games/digimon', 'magento', 'digimon'),
  ('ATU-Toys (Digimon)',           'https://www.atu-toys.ro/index.php?route=product/category&path=270_297', 'opencart', 'digimon');

-- Dragon Ball Super
INSERT INTO stores (name, url, scraper_type, game) VALUES
  ('LexShop (Dragon Ball Super)',          'https://www.lexshop.ro/dragonballz', 'pokemonia', 'dragon_ball_super'),
  ('TCGarena (Dragon Ball Super)',         'https://tcgarena.ro/collections/cartonase-dragon-ball', 'shopify', 'dragon_ball_super'),
  ('RegatulJocurilor (Dragon Ball Super)', 'https://regatuljocurilor.ro/ro/cautare?controller=search&orderby=position&orderway=desc&search_query=dragon+ball+super&submit_search=', 'regatul_jocurilor', 'dragon_ball_super'),
  ('Carturesti (Dragon Ball Super)',       'https://carturesti.ro/product/search/dragon%C2%A0ball%C2%A0super%C2%A0card%C2%A0game', 'carturesti', 'dragon_ball_super'),
  ('RamCards (Dragon Ball Super)',         'https://www.ramcards.ro/dragon-ball-super-tcg', 'gomag', 'dragon_ball_super'),
  ('ATU-Toys (Dragon Ball Super)',         'https://www.atu-toys.ro/index.php?route=product/category&path=270_296', 'opencart', 'dragon_ball_super');

-- Weiss Schwarz
INSERT INTO stores (name, url, scraper_type, game) VALUES
  ('LexShop (Weiss Schwarz)',  'https://www.lexshop.ro/weis-schwarz', 'pokemonia', 'weiss_schwarz'),
  ('TCGarena (Weiss Schwarz)', 'https://tcgarena.ro/collections/cartonase-anime-romania', 'shopify', 'weiss_schwarz'),
  ('RamCards (Weiss Schwarz)', 'https://www.ramcards.ro/wei%C3%9F-schwarz-tcg', 'gomag', 'weiss_schwarz'),
  ('ATU-Toys (Weiss Schwarz)', 'https://www.atu-toys.ro/tcg/weiss-schwarz', 'opencart', 'weiss_schwarz');

-- Riftbound (new game)
INSERT INTO stores (name, url, scraper_type, game) VALUES
  ('Krit (Riftbound)',         'https://krit.ro/en/toate-produsele?page=1&sort=stocked&filters=categories_riftbound-league-of-legends-tcg', 'krit', 'riftbound'),
  ('LexShop (Riftbound)',      'https://www.lexshop.ro/riftbound-league-of-legends-tcg', 'pokemonia', 'riftbound'),
  ('TCGarena (Riftbound)',     'https://tcgarena.ro/collections/cartonase-riftbound', 'shopify', 'riftbound'),
  ('Carturesti (Riftbound)',   'https://carturesti.ro/product/search/riftbound', 'carturesti', 'riftbound'),
  ('RamCards (Riftbound)',     'https://www.ramcards.ro/riftbound-tcg', 'gomag', 'riftbound'),
  ('Hobby-Planet (Riftbound)', 'https://www.hobby-planet.ro/catalog/riftbound-league-of-legends-tcg-309', 'hobby_planet', 'riftbound'),
  ('ATU-Toys (Riftbound)',     'https://www.atu-toys.ro/tcg/riftbound', 'opencart', 'riftbound'),
  ('Secret Cards (Riftbound)', 'https://secretcards.ro/categories/sealed-products?brand=riftbound&in_stock=&max_price=&min_price=&price_range=&promo=&sort=newest&subcategory=', 'secretcards_api', 'riftbound'),
  ('Guildhall (Riftbound)',    'https://shop.guildhall.ro/riftbound', 'pokemonia', 'riftbound');
