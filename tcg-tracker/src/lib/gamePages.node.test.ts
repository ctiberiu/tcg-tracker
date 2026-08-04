import { describe, it, expect } from 'vitest'
import {
  GAME_PAGES,
  GAME_PAGE_CLOSING_LINE,
  RO_PRODUCT_STATUS,
  roCount,
  formatRoNumber,
} from './gamePages'
import { GAMES, STATUS_COLOR } from '../components/packradar/tokens'

/** Every operator-authored string on the pages, in one place, so the copy rules
 *  are asserted over the whole surface rather than over whichever field someone
 *  remembered. */
const ALL_COPY = [
  GAME_PAGE_CLOSING_LINE,
  ...GAME_PAGES.flatMap((p) => [p.name, p.hook, p.metaTitle, p.metaDescription]),
]

describe('game page registry', () => {
  it('names a game that exists in tokens.ts', () => {
    for (const page of GAME_PAGES) {
      expect(GAMES[page.game]).toBeDefined()
    }
  })

  it('has no duplicate paths or games', () => {
    expect(new Set(GAME_PAGES.map((p) => p.path)).size).toBe(GAME_PAGES.length)
    expect(new Set(GAME_PAGES.map((p) => p.game)).size).toBe(GAME_PAGES.length)
  })

  it('uses root-relative paths, so useDocumentMeta builds a valid canonical', () => {
    for (const page of GAME_PAGES) {
      expect(page.path.startsWith('/')).toBe(true)
      expect(page.path.endsWith('/')).toBe(false)
    }
  })

  it('gives every route a distinct title and description', () => {
    // Identical title + description across distinct URLs is a duplicate cluster,
    // and the usual outcome is Google canonicalising them down to one page —
    // the exact failure useDocumentMeta was added to fix.
    expect(new Set(GAME_PAGES.map((p) => p.metaTitle)).size).toBe(GAME_PAGES.length)
    expect(new Set(GAME_PAGES.map((p) => p.metaDescription)).size).toBe(GAME_PAGES.length)
  })
})

describe('operator copy rules', () => {
  // RULE 2, and the one most likely to rot: em and en dashes are not idiomatic
  // Romanian punctuation. Product titles are exempt and are not in this set —
  // they are the retailer's data, and rewriting them would misrepresent the
  // listing.
  it('contains no em or en dashes', () => {
    const offenders = ALL_COPY.filter((s) => /[—–]/.test(s))
    expect(offenders).toEqual([])
  })

  // RULE 1: publishing the cadence tells the shops exactly what to rate-limit.
  // Matches digits followed by a time unit, and the spelled-out Romanian forms,
  // rather than one literal phrase someone can trivially rephrase past.
  it('never states the scrape cadence', () => {
    const cadence = /\d+\s*(min|minut|ore|or[ăa]|sec|h\b)|(la\s+)?(dou[ăa]|cinci|zece|cincisprezece)\s+(minute|ore)/i
    const offenders = ALL_COPY.filter((s) => cadence.test(s))
    expect(offenders).toEqual([])
  })

  // RULE 3: every figure on these pages is queried at render time. A digit in a
  // registry string is a figure that cannot be queried and will go stale.
  it('states no figures', () => {
    const offenders = ALL_COPY.filter((s) => /\d/.test(s))
    expect(offenders).toEqual([])
  })

  it('keeps the closing line exactly as the operator wrote it', () => {
    expect(GAME_PAGE_CLOSING_LINE).toBe(
      'Află primul când produsul revine în stoc și comandă înainte să se epuizeze din nou.',
    )
  })
})

describe('RO_PRODUCT_STATUS', () => {
  // The cards under a heading reading "CELE MAI NOI PRODUSE ÎN STOC" were
  // labelled "● IN STOCK". These four routes exist to serve Romanian search;
  // an English badge on every card is the costliest kind of small defect.
  it('translates the badge the mockups specify', () => {
    expect(RO_PRODUCT_STATUS['IN STOCK']).toBe('ÎN STOC')
  })

  // Covers every status, not just the one the page renders today, so a future
  // preorder path cannot quietly ship in English.
  it('covers every ProductStatus', () => {
    expect(Object.keys(RO_PRODUCT_STATUS).sort()).toEqual(Object.keys(STATUS_COLOR).sort())
  })

  it('leaves no English behind in the labels it replaces', () => {
    for (const [status, label] of Object.entries(RO_PRODUCT_STATUS)) {
      expect(label).not.toBe(status)
    }
  })
})

describe('formatRoNumber', () => {
  it('groups thousands the Romanian way', () => {
    expect(formatRoNumber(1222)).toBe('1.222')
  })

  it('leaves three-digit figures alone', () => {
    expect(formatRoNumber(314)).toBe('314')
  })
})

describe('roCount', () => {
  // Romanian inserts "de" when the numeral's last two digits are 00 or fall
  // between 20 and 99. The approved mockups obey it: "1.222 de produse" and
  // "469 de produse" against "314 produse" and "19 magazine".
  it('inserts "de" above twenty', () => {
    expect(roCount(1222, 'produs', 'produse')).toBe('1.222 de produse')
    expect(roCount(469, 'produs', 'produse')).toBe('469 de produse')
    expect(roCount(20, 'magazin', 'magazine')).toBe('20 de magazine')
  })

  it('omits "de" when the last two digits are under twenty', () => {
    expect(roCount(314, 'produs', 'produse')).toBe('314 produse')
    expect(roCount(19, 'magazin', 'magazine')).toBe('19 magazine')
    expect(roCount(8, 'magazin', 'magazine')).toBe('8 magazine')
  })

  it('restores "de" for a round hundred', () => {
    expect(roCount(100, 'magazin', 'magazine')).toBe('100 de magazine')
    expect(roCount(1000, 'produs', 'produse')).toBe('1.000 de produse')
  })

  // Magic ships with one shop the day migration 034 applies, so this is the
  // live case, not a hypothetical: "la 1 magazine" would be the first thing a
  // Romanian reader sees.
  it('uses the singular noun for one', () => {
    expect(roCount(1, 'magazin', 'magazine')).toBe('1 magazin')
    expect(roCount(1, 'produs', 'produse')).toBe('1 produs')
  })

  it('uses the plural without "de" for zero', () => {
    expect(roCount(0, 'magazin', 'magazine')).toBe('0 magazine')
  })
})
