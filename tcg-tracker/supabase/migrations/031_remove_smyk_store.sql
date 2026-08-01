-- Remove the Smyk store row. Decision made by the user; this records the reason.
--
-- Smyk was enabled, unflagged, at zero consecutive failures, and had NEVER
-- recorded a single product — not stale data, none ever. It read as healthy to
-- every other signal because scrapeSmyk opts into the confirmed-empty mechanism:
-- smyk.com positively reports "no results" for the search, which classifyOutcome
-- correctly treats as `success` rather than a rawCount===0 block. That behaviour
-- is right and is deliberately unchanged elsewhere — it is also what kept this
-- row from auto-disabling and quietly removing itself.
--
-- Earlier investigation concluded the shop carries no Pokemon TCG at all, and
-- that its original disable traced to the search query rather than to broken
-- selectors. So the row was correct about the world and useless to us.
--
-- Why remove rather than leave it: it was the sole entry in the weekly digest's
-- "producing nothing / never" section — the section whose entire job is to
-- surface silent failures. A permanent false positive there trains the reader to
-- skip the section, which costs more than the row is worth. That section needs to
-- be empty when things are fine.
--
-- products.store_id is ON DELETE CASCADE, but Smyk has zero products (verified
-- against live data before writing this), so nothing cascades.
--
-- scrapeSmyk and scraper_type 'smyk' are removed in the same commit. The
-- confirmed-empty mechanism itself stays — scrapeAtuToys is a live user of it and
-- is now the worked example the comments point at.
DELETE FROM stores
WHERE name = 'Smyk'
  AND scraper_type = 'smyk';
