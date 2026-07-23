-- Multi-TCG support: tag every store (and the products it produces) with which
-- card game it's being scraped for. Existing rows all backfill to 'pokemon'
-- (the only game scraped until now) via the column default.
ALTER TABLE stores
  ADD COLUMN game text NOT NULL DEFAULT 'pokemon'
  CHECK (game IN ('pokemon', 'magic', 'lorcana', 'yugioh', 'digimon', 'one_piece', 'duel_masters', 'dragon_ball_super', 'weiss_schwarz'));

ALTER TABLE products
  ADD COLUMN game text NOT NULL DEFAULT 'pokemon'
  CHECK (game IN ('pokemon', 'magic', 'lorcana', 'yugioh', 'digimon', 'one_piece', 'duel_masters', 'dragon_ball_super', 'weiss_schwarz'));

CREATE INDEX idx_products_game ON products (game);
