-- ATU-Toys moved their catalogue behind a locale prefix (/tcg/... -> /ro/tcg/...)
-- and renamed several category slugs at the same time. Every one of their 8 store
-- rows 404'd from that moment on, scraped 0 products, and was classified as a
-- block-like failure until all 8 auto-disabled (consecutive_failures 15-17).
--
-- This is one site migration, not eight independent store failures — the whole
-- domain went down together and came back together.
--
-- Three slugs changed beyond the /ro/ prefix, and two rows were still pointing at
-- the pre-SEO index.php?route=product/category URLs:
--   riftbound          -> riftbound-tcg
--   one-piece-ro       -> one-piece-card-game
--   path=270_297       -> digimon-card-game
--   path=270_296       -> dragon-ball-super-card-game
UPDATE stores SET url = 'https://www.atu-toys.ro/ro/tcg/pokemon'                       WHERE name = 'ATU-Toys';
UPDATE stores SET url = 'https://www.atu-toys.ro/ro/tcg/yu-gi-oh'                      WHERE name = 'ATU-Toys (Yu-Gi-Oh!)';
UPDATE stores SET url = 'https://www.atu-toys.ro/ro/tcg/lorcana'                       WHERE name = 'ATU-Toys (Lorcana)';
UPDATE stores SET url = 'https://www.atu-toys.ro/ro/tcg/weiss-schwarz'                 WHERE name = 'ATU-Toys (Weiss Schwarz)';
UPDATE stores SET url = 'https://www.atu-toys.ro/ro/tcg/riftbound-tcg'                 WHERE name = 'ATU-Toys (Riftbound)';
UPDATE stores SET url = 'https://www.atu-toys.ro/ro/tcg/one-piece-card-game'           WHERE name = 'ATU-Toys (One Piece)';
UPDATE stores SET url = 'https://www.atu-toys.ro/ro/tcg/digimon-card-game'             WHERE name = 'ATU-Toys (Digimon)';
UPDATE stores SET url = 'https://www.atu-toys.ro/ro/tcg/dragon-ball-super-card-game'   WHERE name = 'ATU-Toys (Dragon Ball Super)';

-- The rebuild was not just a URL change: ATU-Toys migrated OFF OpenCart onto a
-- bespoke theme (/themes/atutoys), and the product grid is now rendered
-- client-side into `.prod-row`. None of the OpenCart selectors ('.product-thumb')
-- exist any more, so correcting the URLs alone would still scrape 0 products and
-- walk every row back to disabled. Point them at the new 'atu_toys' scraper.
UPDATE stores SET scraper_type = 'atu_toys' WHERE name LIKE 'ATU-Toys%';

-- Magic: The Gathering is a new category on the migrated site — no row existed for
-- it. 'magic' has been an allowed game since migration 028 and GAME_NAME_PATTERNS
-- already carries a pattern for it (scraper.js), so this needs no schema change.
-- Added enabled: it is a fresh row with no failure history to clear.
INSERT INTO stores (name, url, scraper_type, game) VALUES
  ('ATU-Toys (Magic: The Gathering)', 'https://www.atu-toys.ro/ro/tcg/magic-the-gathering', 'atu_toys', 'magic');

-- Re-enable the 8 migrated rows and clear their failure state.
--
-- Clearing is_flagged/flagged_at is NOT cosmetic and must not be skipped: all 8
-- carry a flagged_at that is already far older than FLAG_DISABLE_GRACE_MS (12h),
-- so applyFailureOutcome() would take the already-flagged branch, find the grace
-- long since elapsed, and auto-disable each row again on its very FIRST block-like
-- failure — before the corrected URLs ever got a fair run.
UPDATE stores
SET is_enabled           = true,
    is_flagged           = false,
    flagged_at           = NULL,
    consecutive_failures = 0
WHERE name LIKE 'ATU-Toys%';
