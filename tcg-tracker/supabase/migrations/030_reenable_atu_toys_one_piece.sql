-- Re-enable ATU-Toys (One Piece), auto-disabled by a bug in the scraper rather
-- than by anything wrong with the store.
--
-- Cause: commit 9bf84aa moved the binder/sleeve/alcove accessory filter INTO
-- scrapeAtuToys, skipping those products at the source. ATU-Toys' One Piece
-- category is 15 products and every single one is a card sleeve, so the scraper
-- returned an empty array. An empty array is indistinguishable from a total
-- scrape failure: classifyOutcome saw rawCount 0, called it a block, and 17
-- consecutive strikes later the store auto-disabled — while the page was
-- serving 15 products perfectly well the whole time.
--
-- Fixed in the same commit as this migration: accessories are now returned with
-- categoryConfirmed=false, so isGameProduct() still drops them downstream while
-- rawCount stays honest. Verified live: One Piece now classifies as `success`
-- with 15 raw and nothing kept, which is the truth — the scraper works, the
-- category has no TCG product in it.
--
-- Clearing is_flagged/flagged_at is NOT cosmetic: flagged_at is older than
-- FLAG_DISABLE_GRACE_MS (12h), so applyFailureOutcome would take the
-- already-flagged branch and auto-disable again on the very first block-like
-- failure, before the fix ever got a fair run. Same reasoning as migration 029.
UPDATE stores
SET is_enabled           = true,
    is_flagged           = false,
    flagged_at           = NULL,
    consecutive_failures = 0
WHERE name = 'ATU-Toys (One Piece)';
