import { getStoreBaseName } from './storeName'

/**
 * The two rules that turn "newest in-stock rows for a game" into the eight
 * cards a landing page shows. Both are presentation-layer, both are
 * load-bearing, and both are here rather than inline in the page so they can be
 * asserted without a DOM.
 *
 * A future reader seeing 8 cards from 5 shops will otherwise assume that is
 * what the data looks like. It is not.
 */

/**
 * RULE 1 — at most two cards per shop.
 *
 * Ordering purely by `first_seen` gives one retailer the whole grid: measured
 * 2026-08-04, the newest ten in-stock rows were 9/10 ATU-Toys for Yu-Gi-Oh and
 * 10/10 ATU-Toys for One Piece. A page whose copy claims to aggregate every
 * Romanian shop, showing one retailer's catalogue, defeats its own claim.
 */
export const MAX_CARDS_PER_SHOP = 2

/** Cards rendered. Matches the mockups' 8-card grid. */
export const CARD_COUNT = 8

/**
 * How many newest in-stock rows to fetch before the two filters run.
 *
 * MEASURED, not estimated. The epic proposed ~40; that is enough for three of
 * the four games and NOT for Lorcana, which yields 4 cards at 40 because 22 of
 * its 89 in-stock rows are accessories and it only has 8 shops to draw from
 * under the per-shop cap. Sweeping the window against live data on 2026-08-04:
 *
 *     window   40   pokemon 8   yugioh 8   one_piece 8   lorcana 4
 *     window   60   pokemon 8   yugioh 8   one_piece 8   lorcana 7
 *     window  100   pokemon 8   yugioh 8   one_piece 8   lorcana 8
 *
 * 100 is also `useProducts`' own default page size, so this costs a page it
 * already knows how to fetch.
 */
export const CARD_WINDOW = 100

/**
 * RULE 2 — drop accessories.
 *
 * 22 of Lorcana's 89 in-stock rows are playmats, deck boxes and portfolios. A
 * page titled "Cărți Lorcana" leading with six playmats undercuts its own
 * heading.
 *
 * WORD BOUNDARIES ARE NOT DECORATION HERE. "cana" is a substring of "Lorcana",
 * so the same list matched with `.includes()` flags 89 of 89 in-stock Lorcana
 * titles and empties the page. `\b` is what makes the list safe.
 *
 * Terms are the ones actually observed in live titles (playmat, covoraș, deck
 * box, portfolio, binder, album, storage box, card case, sleeve, toploader)
 * plus `alcove`, which `isGameProduct` already denies, and `cana`, the mug case
 * recorded in backlog 2fac0531. Nothing speculative: on 2026-08-04 this flagged
 * 18/314 pokemon, 0/163 yugioh, 6/51 one_piece and 22/89 lorcana, and all 46
 * matched titles were enumerated individually with zero false positives.
 *
 * No trailing `\b`: several terms end in non-ASCII letters ("covoraș"), where
 * JavaScript's ASCII-only `\b` would never match.
 *
 * This is presentation only. The underlying cause is that `isGameProduct` has
 * no merch rule at all — it requires a TCG keyword and denies only
 * binder|sleeve|alcove, so "Cana - Pokemon TCG - Pikachu" passes into the
 * database in the first place. That is backlog 2fac0531, not this page.
 */
export const ACCESSORY_TITLE =
  /\b(play ?mats?|gaming mats?|covora[sș]|portfolios?|binders?|deck ?box(es)?|sleeves?|top ?loaders?|alcove|card cases?|storage box(es)?|albume?)/i

export function isAccessoryTitle(title: string): boolean {
  return ACCESSORY_TITLE.test(title)
}

interface CardRow {
  title: string
  store_name: string
}

/**
 * Applies both rules, in order, to rows already sorted newest-first, and
 * returns at most `CARD_COUNT`.
 *
 * Accessories are dropped BEFORE the per-shop cap, not after: dropping them
 * afterwards would let two playmats consume a shop's two slots and then be
 * removed, costing that shop its place in the grid entirely.
 */
export function selectGameCards<T extends CardRow>(rows: readonly T[], limit = CARD_COUNT): T[] {
  const perShop = new Map<string, number>()
  const picked: T[] = []

  for (const row of rows) {
    if (picked.length >= limit) break
    if (isAccessoryTitle(row.title)) continue

    // Merge on base name: "RedGoblin" and "RedGoblin (One Piece)" are one shop,
    // so the cap has to count them together.
    const shop = getStoreBaseName(row.store_name)
    const used = perShop.get(shop) ?? 0
    if (used >= MAX_CARDS_PER_SHOP) continue

    perShop.set(shop, used + 1)
    picked.push(row)
  }

  return picked
}
