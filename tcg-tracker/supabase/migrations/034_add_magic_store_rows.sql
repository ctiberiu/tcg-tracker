-- Magic coverage: add 8 store rows for game='magic'.
--
-- `stores` had exactly ONE magic row (ATU-Toys) against 27 for pokemon. That was
-- read as "Magic is thin in Romania" when planning the SEO game pages. It was a
-- configuration gap, not a market fact — the scraper only ever visits URLs
-- someone configured, and nobody configured Magic. Verified against the live
-- scraper, these 8 shops expose 557 Magic products between them versus the 30
-- currently tracked.
--
-- ── INSERTED DISABLED, DELIBERATELY ─────────────────────────────────────────
-- Every row below is is_enabled=false. This is the insert posture, not a
-- failure posture — each URL was verified working before this migration was
-- written.
--
-- Reason: waitingSince() in schedule.js returns -Infinity for a row that has
-- never been scraped, and capOnePerDomain sorts ascending, so a NEW row
-- outranks every established row on its host. Inserting 8 at once would make
-- first contact with 8 shops in a single run, ~2-5s apart, from one runner IP —
-- which is the burst profile the 2026-07-04 mass auto-disable was attributed
-- to, and first contact is exactly when a WAF reacts. fetchStores filters
-- is_enabled BEFORE the due filter, so a disabled row cannot win a slot and
-- costs nothing in contention.
--
-- Enable in small batches, and take a per-store product count before and after
-- each batch rather than enabling all 8 and reading a total.
--
-- ── check_interval_minutes = 30 on crowded hosts ────────────────────────────
-- capOnePerDomain serves one row per HOST per run, so a host's steady-state
-- period is `rows x run_interval`. Adding a Magic row to a shared host does not
-- slow Magic — it slows the games already there. Re-derived from live data
-- rather than from the row counts hardcoded in five separate comments (which
-- have now drifted far enough to contradict each other):
--
--     lexshop.ro            9 rows -> 10   (20 min at a 2-min cron)
--     ramcards.ro           8 -> 9         (18 min)
--     tcgarena.ro           8 -> 9         (18 min)
--     krit.ro               7 -> 8         (16 min)
--     hobby-planet.ro       6 -> 7         (14 min)
--     transylvaniagames.com 5 -> 6         (12 min)
--     redgoblin.ro          4 -> 5         (10 min)
--     arcanainn.ro          1 -> 2          (4 min)
--
-- The four hosts already at >=7 get 30 minutes instead of the 15-minute
-- default. Because the cap serves one row per host per run, a row due half as
-- often competes for half as many slots — a real reduction in contention for
-- the established games, not a cosmetic setting. 30 min is still 48 sweeps/day.
--
-- ── Verified counts (real scraper, not curl) ────────────────────────────────
-- Column 2 is products whose title matches GAME_NAME_PATTERNS.magic, i.e. what
-- commit() would actually keep.
--
--     Krit                 96 raw / 96 magic   (walks 4 pages)
--     RedGoblin           250 raw / 245 magic  (250 is the Shopify limit cap)
--     TCGarena             79 raw /  79 magic
--     Hobby-Planet         50 raw /  47 magic
--     RamCards             31 raw /  31 magic
--     Transylvania Games   27 raw /  27 magic
--     LexShop              24 raw /  24 magic
--     Arcana Inn           15 raw /   8 magic  (collection mixes in non-MTG)
--
-- ── URL shapes that needed a decision, both settled by testing ──────────────
-- Transylvania Games: the CATEGORY url follows this shop's majority pattern —
-- it is NOT a deviation. Enumerated from migrations 025-028 as they stood when
-- this migration was written, its five existing rows split 3 category/2 search:
--
--     /card-games/pokemon                (025)  category
--     /card-games/yu-gi-oh               (028)  category
--     /card-games/digimon                (028)  category
--     catalogsearch/result/?q=one+piece  (026)  search
--     catalogsearch/result/?q=lorcana    (027)  search
--
-- The premise this row was chosen under — that every other row for this shop
-- uses the magento search pattern `catalogsearch/result/?q=` — was inverted.
-- Category is the house pattern here; search is the minority.
--
-- The choice does not rest on that premise and does not change, because it was
-- measured: the search URL returns 0 products (the page renders, titled
-- "Rezultatele cautarii pentru: 'magic the gathering'", but only 2
-- `.product-item` nodes and the scraper extracts none), while the supplied
-- CATEGORY url returns 27. Category wins on measurement, and precedent agrees
-- with the measurement rather than opposing it.
--
-- RedGoblin: the one real deviation here. Supplied with `/ro/` and gclid
-- tracking params; stripped to match the existing Lorcana row's form. The
-- stripped form returns 245 magic products.
--
-- ── NOT added, and why ──────────────────────────────────────────────────────
-- ATU-Toys        already has a magic row. The alternate URL supplied
--                 (/tcg/mtg) returns 24 raw but only ONE magic title — it is an
--                 accessories page. The existing row (/ro/tcg/magic-the-gathering)
--                 returns 30/30. Existing row kept, no duplicate added.
--
-- Carturesti      NOT a bad URL and NOT a block. The page loads (HTTP 200, no
--                 challenge, title "Magic The Gathering") and renders 16 product
--                 nodes. scrapeCarturesti returns 0 because it is HARDCODED to
--                 Pokemon: `if (!title.toLowerCase().includes('pokemon tcg'))
--                 continue;`. It cannot yield Magic — or Digimon, Riftbound or
--                 Dragon Ball Super — without a scraper change. That is also
--                 the likely reason Carturesti's non-Pokemon rows are disabled.
--
-- Guildhall       WAF-blocked. HTTP 403, page title "Just a moment...", body
--                 "Performing security verification". Directly observed, not
--                 inferred. All 4 of its rows are already auto-disabled.
--
-- RegatulJocurilor  Its 6 rows are auto-disabled, BUT the site scrapes fine
--                 today — the supplied Magic URL returns 20/20 products through
--                 the real scraper. Its disable looks stale rather than
--                 justified. Deliberately not added here: adding a row to a
--                 disabled shop achieves nothing (fetchStores filters
--                 is_enabled first), and re-enabling belongs with whatever
--                 investigation explains the original failure.
--
-- Collectify      No scraper_type and absent from `stores` entirely. It is a
--                 new shop, not a new category — WooCommerce, from the
--                 `?filter_producator=` product-category URL shape. Adding it
--                 means identifying or writing a scraper. Out of scope.

INSERT INTO stores (name, url, scraper_type, game, is_enabled, check_interval_minutes) VALUES
  ('Krit (Magic: The Gathering)',
   'https://krit.ro/en/toate-produsele?page=1&sort=stocked&filters=categories_magic-the-gathering',
   'krit', 'magic', false, 30),

  ('LexShop (Magic: The Gathering)',
   'https://www.lexshop.ro/magic-the-gathering-tcg',
   'pokemonia', 'magic', false, 30),

  ('RedGoblin (Magic: The Gathering)',
   'https://redgoblin.ro/collections/magic-the-gathering',
   'shopify', 'magic', false, 15),

  ('TCGarena (Magic: The Gathering)',
   'https://tcgarena.ro/collections/cartonase-magic-the-gathering',
   'shopify', 'magic', false, 30),

  ('RamCards (Magic: The Gathering)',
   'https://www.ramcards.ro/magic-the-gathering-tcg',
   'gomag', 'magic', false, 30),

  ('Hobby-Planet (Magic: The Gathering)',
   'https://www.hobby-planet.ro/catalog/mtg-241',
   'hobby_planet', 'magic', false, 15),

  ('Transylvania Games (Magic: The Gathering)',
   'https://www.transylvaniagames.com/card-games/magic-the-gathering',
   'magento', 'magic', false, 15),

  ('Arcana Inn (Magic: The Gathering)',
   'https://arcanainn.ro/collections/boosters-mtg',
   'shopify', 'magic', false, 15);
