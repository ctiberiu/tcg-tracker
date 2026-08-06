-- Fix Foon.ro: it was added disabled with the wrong scraper_type ('krit').
-- Foon does carry Pokemon TCG; enable it and point it at the dedicated
-- 'foon' scraper (accepts the cookie consent, parses .k-i product cards).
UPDATE stores
SET scraper_type = 'foon',
    is_enabled   = true,
    url          = 'https://foon.ro/katalog?q=pokemon+tcg'
WHERE name = 'Foon';
