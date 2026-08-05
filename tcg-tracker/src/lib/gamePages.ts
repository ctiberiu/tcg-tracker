import type { GameKey, ProductStatus } from '../components/packradar/tokens'

/**
 * The Romanian game landing pages — one entry per route, one component
 * (`GameLandingPage`) rendering all of them.
 *
 * ADDING A GAME IS ADDING AN ENTRY HERE AND NOTHING ELSE. App.tsx maps this
 * array to routes, the page derives every other string from `name`, and the
 * colours come from `GAMES` in tokens.ts. That is the design constraint the
 * epic set, because Magic gets its page as soon as `magic-coverage` merges and
 * migration 034 applies.
 *
 * WHAT IS DELIBERATELY NOT IN HERE:
 *
 *  - Colours. `GAMES[key].color` / `.dim` in tokens.ts is the only copy. A
 *    second copy is exactly how the design project's older GAME_DEFS drifted
 *    from the site on One Piece (#FF4747 vs the real #FF5A5A), Digimon, Dragon
 *    Ball and Weiss Schwarz.
 *  - Any figure. Every number on these pages is queried at render time
 *    (`useGameLanding`). A wrong number on a price-comparison page is the one
 *    error this audience catches instantly.
 *  - The h1 parts, breadcrumb, CTA label and footnote. All four are `name` in a
 *    different case, so they are derived in the component. Storing them would
 *    be four more strings per game that can disagree with each other.
 *
 * COPY RULES (operator's, from the design project's `game-page.css`):
 *  1. Never state the scrape cadence. Publishing "every 2 minutes" tells the
 *     shops exactly what to rate-limit. Say tracking is constant, never how
 *     constant.
 *  2. No em or en dashes. Not idiomatic Romanian punctuation. Product titles
 *     are exempt — those are the retailer's data and rewriting them would
 *     misrepresent the listing. Asserted in gamePages.node.test.ts, because
 *     this is the rule most likely to rot.
 *  3. No invented figures.
 *  4. The closing line is the operator's wording, verbatim (see
 *     `GAME_PAGE_CLOSING_LINE`).
 */
export interface GamePage {
  /** Route path. This array is the single source of truth for "which game
   *  pages exist" — the sitemap task reads it rather than restating the list. */
  path: string
  game: GameKey
  /**
   * Mixed-case Romanian display name. `GAMES[key].label` is uppercase because
   * it is a badge label; the h1 and the body copy need "Pokémon", not
   * "POKÉMON". The breadcrumb and CTA uppercase this back.
   */
  name: string
  /** The one sentence of paragraph 2 that is not shared between games. */
  hook: string
  metaTitle: string
  metaDescription: string
}

/**
 * Operator's wording, verbatim, and not to be edited: "comanda" is what the
 * READER does, which is the whole distinction from a buying bot.
 */
export const GAME_PAGE_CLOSING_LINE =
  'Află primul când produsul revine în stoc și comandă înainte să se epuizeze din nou.'

/**
 * Product-status badge text for these pages only.
 *
 * The section above every card grid reads "CELE MAI NOI PRODUSE ÎN STOC" and
 * the cards under it were reading "● IN STOCK" — English labels on the four
 * pages that exist to serve Romanian search. The mockups specify "● ÎN STOC".
 *
 * `ProductStatus`' values are NOT changed: they read like data and something
 * may compare against them, and /view and /stores stay English. This is a
 * render-boundary override passed to StatusBadge, which still takes its colour
 * from the status itself.
 *
 * Typed as a full Record so a new ProductStatus member fails the build here
 * rather than silently rendering in English.
 */
export const RO_PRODUCT_STATUS: Record<ProductStatus, string> = {
  'IN STOCK': 'ÎN STOC',
  PREORDER: 'PRECOMANDĂ',
  GONE: 'EPUIZAT',
}

export const GAME_PAGES: readonly GamePage[] = [
  {
    path: '/carti-pokemon',
    game: 'pokemon',
    name: 'Pokémon',
    hook: 'Produsele căutate, cum sunt cutiile Elite Trainer Box și display-urile din noile seturi, dispar de obicei repede din stoc.',
    metaTitle: 'Cărți Pokémon în România: ce este în stoc acum | PackRadar',
    metaDescription:
      'Cărți Pokémon în stoc acum în magazinele online din România, de la Elite Trainer Box la display-uri. Afli imediat când un produs revine în stoc.',
  },
  {
    path: '/carti-yugioh',
    game: 'yugioh',
    name: 'Yu-Gi-Oh!',
    hook: 'Structure Deck-urile și display-urile de booster din noile seturi dispar de obicei repede din stoc.',
    metaTitle: 'Cărți Yu-Gi-Oh! în România: ce este în stoc acum | PackRadar',
    metaDescription:
      'Cărți Yu-Gi-Oh! în stoc acum în magazinele online din România, de la Structure Deck-uri la display-uri de booster. Afli imediat când un produs revine.',
  },
  {
    path: '/carti-one-piece',
    game: 'one_piece',
    name: 'One Piece',
    hook: 'Starter Deck-urile și cutiile de booster din noile seturi dispar de obicei repede din stoc.',
    metaTitle: 'Cărți One Piece în România: ce este în stoc acum | PackRadar',
    metaDescription:
      'Cărți One Piece în stoc acum în magazinele online din România, de la Starter Deck-uri la cutii de booster. Afli imediat când un produs revine în stoc.',
  },
  {
    path: '/carti-lorcana',
    game: 'lorcana',
    name: 'Lorcana',
    hook: "Illumineer's Trove și starter deck-urile din noile seturi dispar de obicei repede din stoc.",
    metaTitle: 'Cărți Lorcana în România: ce este în stoc acum | PackRadar',
    metaDescription:
      "Cărți Lorcana în stoc acum în magazinele online din România, de la Illumineer's Trove la starter deck-uri. Afli imediat când un produs revine în stoc.",
  },
  {
    path: '/carti-magic',
    game: 'magic',
    // "Magic", not "Magic: The Gathering": the h1 renders it as
    // "Cărți <em>Magic</em> în România" and the CTA uppercases it, and a colon
    // inside both reads as a broken sentence. Matches the slug and the
    // tokens.ts label.
    name: 'Magic',
    hook: 'Display-urile de Play Booster și deck-urile Commander din noile seturi dispar de obicei repede din stoc.',
    metaTitle: 'Cărți Magic în România: ce este în stoc acum | PackRadar',
    metaDescription:
      'Cărți Magic în stoc acum în magazinele online din România, de la display-uri de Play Booster la deck-uri Commander. Afli imediat când un produs revine în stoc.',
  },
]

/** ro-RO grouping: 1222 renders as "1.222", which is what the mockups show. */
export function formatRoNumber(count: number): string {
  return count.toLocaleString('ro-RO')
}

/**
 * Romanian numeral agreement, applied rather than baked in because these counts
 * are live.
 *
 * Two rules, both of which the mockups' own figures obey:
 *  - 1 takes the singular noun: "1 magazin", not "1 magazine".
 *  - The linking "de" appears when the numeral's last two digits are 00 or fall
 *    between 20 and 99: "1.222 de produse" and "469 de produse", but
 *    "314 produse" and "19 magazine".
 *
 * Without this, Magic's page (one shop today) would read "la 1 magazine", and
 * any game crossing 20 shops would read "la 21 magazine".
 */
export function roCount(count: number, singular: string, plural: string): string {
  if (count === 1) return `1 ${singular}`
  const lastTwo = Math.abs(Math.trunc(count)) % 100
  const needsDe = count >= 20 && (lastTwo === 0 || lastTwo >= 20)
  return `${formatRoNumber(count)} ${needsDe ? 'de ' : ''}${plural}`
}
