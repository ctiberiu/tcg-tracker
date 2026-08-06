-- Add Carturesti.ro store for scraping (AngularJS SPA, scraper_type 'carturesti').
-- Uses the "tcg" search (their Pokemon TCG products surface there, named
-- "Pokemon TCG: ..."), not a "pokemon" search which returns only books/merch.
-- The scraper filters titles to those containing "pokemon tcg".
INSERT INTO stores (name, url, scraper_type) VALUES
  ('Carturesti', 'https://carturesti.ro/product/search/tcg', 'carturesti')
ON CONFLICT (url) DO NOTHING;
