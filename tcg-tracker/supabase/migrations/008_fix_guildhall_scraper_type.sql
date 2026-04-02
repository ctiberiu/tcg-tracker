-- Guildhall uses Gomag platform (same as Pokemonia/LexShop), not Shopify.
-- The Shopify JSON API does not work for this store (Cloudflare blocks it).
UPDATE stores
SET scraper_type = 'pokemonia'
WHERE name = 'Guildhall';
