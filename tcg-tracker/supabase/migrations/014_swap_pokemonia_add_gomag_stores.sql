-- Pokemonia.ro rebranded to CardXTCG.ro (same Gomag platform, same /produse-1
-- catalog). The old domain now fails with SSL errors, so disable it and add
-- the replacement. Also add RamCards.ro, another Gomag-based Pokemon TCG shop.
-- Both use the Gomag scraper (scraper_type 'gomag', alias of 'pokemonia').

-- Retire the dead Pokemonia store (kept for product history, just not scraped)
UPDATE stores SET is_enabled = false WHERE name = 'Pokemonia';

-- Add the rebranded shop + the new one
INSERT INTO stores (name, url, scraper_type) VALUES
  ('CardXTCG', 'https://www.cardxtcg.ro/produse-1', 'gomag'),
  ('RamCards', 'https://www.ramcards.ro/pokemon-tcg', 'gomag')
ON CONFLICT (url) DO NOTHING;
