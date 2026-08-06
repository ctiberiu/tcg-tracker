import { describe, it, expect } from 'vitest'
import {
  selectGameCards,
  selectShopChips,
  isAccessoryTitle,
  MAX_CARDS_PER_SHOP,
  MAX_SHOP_CHIPS,
  CARD_COUNT,
} from './gameCards'
import { getStoreBaseName } from './storeName'

const row = (store_name: string, title: string) => ({ store_name, title })

describe('isAccessoryTitle', () => {
  // THE CASE THAT DECIDES THE IMPLEMENTATION. "cana" is a substring of
  // "Lorcana", so this same term list matched with `.includes()` flags 89 of 89
  // in-stock Lorcana titles and empties the page. Word boundaries are the whole
  // reason this is a regex.
  it('does not treat a Lorcana title as an accessory', () => {
    expect(isAccessoryTitle('Disney Lorcana TCG: Reign of Jafar Palace Heist Quest')).toBe(false)
    expect(isAccessoryTitle("Lorcana: Whispers in the Well - Spectacular Spectaters Starter Deck")).toBe(false)
  })

  // Real titles taken from live in-stock rows on 2026-08-04, one per term class.
  it.each([
    'Disney Lorcana TCG: Fabled Playmat Mufasa',
    'Lorcana TCG - Playmat - Goofy',
    'Disney Lorcana TCG: Azurite Sea Deck Box Winnie the Pooh',
    'Pokemon: Ultra Pro: Haunted Hollow Deckbox',
    'Pokémon TCG: Mini Portfolio 26Q4 Mega Greninja/Zeraora',
    'Pokémon TCG: SV03 Obsidian Flames - A5 Album',
    'Covoraș de joacă cu cărți Ultra Pro - Pokemon TCG: Caterpie Evolutions Stitched Playmat',
    'One Piece Card Game - Playmat and Storage Box Set - Nami',
    'One Piece TCG: Playmat and Card Case Set - 25th Anniversary Edition',
  ])('flags %s', (title) => {
    expect(isAccessoryTitle(title)).toBe(true)
  })

  it.each([
    'Pokémon TCG: Mega Evolution - Pitch Black Booster Bundle',
    'Yu-Gi-Oh! Trading Card Game Egyptian God Deck: Obelisk the Tormentor',
    'One Piece Card Game Starter Deck – Roronoa Zoro [ST-32]',
    'Magic: The Gathering – Secrets of Strixhaven Prerelease Pack',
    'Pokémon TCG: ME03 - Perfect Order - Cutie de antrenor de elită',
  ])('leaves %s alone', (title) => {
    expect(isAccessoryTitle(title)).toBe(false)
  })

  // `cana` was named in this rule's comment and absent from the pattern. Both
  // directions asserted, because the term is only safe BECAUSE of its
  // boundaries: it is a Romanian mug and a substring of "Lorcana".
  it('flags a mug and still spares Lorcana', () => {
    expect(isAccessoryTitle('Cana - Pokemon TCG - Pikachu')).toBe(true)
    expect(isAccessoryTitle('Disney Lorcana TCG: Azurite Sea Booster')).toBe(false)
  })
})

describe('selectGameCards', () => {
  it('caps a single shop at two cards even when it holds every newest row', () => {
    // One Piece's real shape on 2026-08-04: the newest ten in-stock rows were
    // 10/10 ATU-Toys. Without the cap the grid is one retailer's catalogue.
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row('ATU-Toys', `One Piece Starter Deck ST-${i}`)),
      row('Krit', 'One Piece Card Game Booster'),
      row('Hobby-Planet', 'One Piece TCG: Starter Deck Bundle'),
    ]

    const cards = selectGameCards(rows)

    expect(cards.filter((c) => c.store_name === 'ATU-Toys')).toHaveLength(MAX_CARDS_PER_SHOP)
    expect(cards).toHaveLength(4)
  })

  it('counts the per-shop cap across a shop’s per-game rows', () => {
    // "RedGoblin" and "RedGoblin (One Piece)" are one physical shop, so three
    // rows split across two names must still yield two cards, not three.
    const rows = [
      row('RedGoblin', 'Lorcana TCG - Into the Inklands Gift Set 3'),
      row('RedGoblin (Lorcana)', 'Lorcana TCG - Rise of the Floodborn Starter Deck'),
      row('RedGoblin', 'Lorcana TCG - Azurite Sea Booster'),
    ]

    expect(selectGameCards(rows)).toHaveLength(MAX_CARDS_PER_SHOP)
  })

  it('excludes accessories', () => {
    const rows = [
      row('ATU-Toys', 'Disney Lorcana TCG: Fabled Playmat Mufasa'),
      row('ATU-Toys', 'Disney Lorcana TCG: Reign of Jafar Palace Heist Quest'),
    ]

    const cards = selectGameCards(rows)

    expect(cards).toHaveLength(1)
    expect(cards[0].title).toContain('Palace Heist Quest')
  })

  // THE ORDERING THAT MATTERS. If the cap ran first, this shop's two slots would
  // be spent on two playmats which are then dropped, and the shop would lose its
  // place in the grid entirely rather than contributing its real product.
  it('does not let dropped accessories consume a shop’s two slots', () => {
    const rows = [
      row('ATU-Toys', 'Disney Lorcana TCG: Fabled Playmat Mufasa'),
      row('ATU-Toys', 'Disney Lorcana TCG: Winterspell Ariel Playmat'),
      row('ATU-Toys', 'Disney Lorcana TCG: Reign of Jafar Palace Heist Quest'),
    ]

    expect(selectGameCards(rows)).toHaveLength(1)
  })

  it('preserves the newest-first order it is given', () => {
    const rows = [row('A', 'first'), row('B', 'second'), row('C', 'third')]
    expect(selectGameCards(rows).map((r) => r.title)).toEqual(['first', 'second', 'third'])
  })

  it('never returns more than the card count', () => {
    const rows = Array.from({ length: 40 }, (_, i) => row(`Shop ${i}`, `Booster ${i}`))
    expect(selectGameCards(rows)).toHaveLength(CARD_COUNT)
  })

  it('returns nothing for an empty input rather than throwing', () => {
    expect(selectGameCards([])).toEqual([])
  })

  it('returns nothing when every row is an accessory', () => {
    const rows = [
      row('ATU-Toys', 'Disney Lorcana TCG: Fabled Playmat Mufasa'),
      row('Krit', 'Pokemon: Ultra Pro: Seaside Deckbox'),
    ]
    expect(selectGameCards(rows)).toEqual([])
  })
})

describe('selectShopChips', () => {
  /** The Pokémon page's real shape on 2026-08-04: 19 shops in in-stock volume
   *  order, and a grid whose shops sat at positions 1, 12, 6, 5, 7 and 16. */
  const nineteenShops = [
    'Pokemania', 'RamCards', 'Noriel', 'Krit', 'Arcana Inn', 'Hobby-Planet',
    'LumeaJocurilor', 'Ozone', 'BebeTei', 'RedGoblin', 'CardXTCG', 'LexShop',
    'Flamey', 'Foon', 'LibHumanitas', 'TCGarena', 'Transylvania Games',
    'BookCity', 'RaiJucarii',
  ]
  const gridCards = [
    row('Pokemania', 'a'), row('LexShop', 'b'), row('Hobby-Planet', 'c'),
    row('Pokemania', 'd'), row('TCGarena', 'e'), row('LumeaJocurilor', 'f'),
    row('LumeaJocurilor', 'g'), row('RaiJucarii', 'h'),
  ]

  // THE DEFECT THIS FUNCTION EXISTS FOR. LexShop, TCGarena and RaiJucarii were
  // in the card grid and absent from the eleven chips above it — the page
  // naming a set of shops and then showing products from shops outside it.
  // It is a relationship between two independently-correct functions, so
  // nothing but an assertion spanning both will catch it drifting.
  it('shows every shop that appears in the card grid', () => {
    const { visible } = selectShopChips(nineteenShops, gridCards)
    const inGrid = new Set(gridCards.map((c) => getStoreBaseName(c.store_name)))

    for (const shop of inGrid) {
      expect(visible).toContain(shop)
    }
  })

  it('fills the remaining slots from the incoming order', () => {
    const { visible } = selectShopChips(nineteenShops, gridCards)

    expect(visible).toHaveLength(MAX_SHOP_CHIPS)
    // Promoted first, in their original relative order, then the rest.
    expect(visible.slice(0, 5)).toEqual([
      'Pokemania', 'Hobby-Planet', 'LumeaJocurilor', 'LexShop', 'TCGarena',
    ])
    expect(visible.slice(6)).toEqual(['RamCards', 'Noriel', 'Krit', 'Arcana Inn', 'Ozone'])
  })

  it('counts the hidden remainder rather than assuming a number', () => {
    const { visible, hidden } = selectShopChips(nineteenShops, gridCards)
    expect(hidden).toBe(nineteenShops.length - visible.length)
    expect(hidden).toBe(8)
  })

  // Yu-Gi-Oh, One Piece and Lorcana all sit at eight shops, so this is their
  // everyday path, not an edge case. Nothing is hidden, so nothing is promoted
  // and the order does not churn as products land.
  it('leaves the order untouched when every shop fits', () => {
    const eight = ['ATU-Toys', 'Hobby-Planet', 'Krit', 'LexShop', 'RamCards', 'RedGoblin', 'TCGarena', 'Transylvania Games']
    const { visible, hidden } = selectShopChips(eight, [row('TCGarena', 'a')])

    expect(visible).toEqual(eight)
    expect(hidden).toBe(0)
  })

  it('merges a shop’s per-game rows before matching, so a suffixed card still promotes its shop', () => {
    // The grid row is "RedGoblin (Lorcana)"; the chip is "RedGoblin". Matching
    // raw names would leave RedGoblin unpromoted and reintroduce the defect.
    const shops = Array.from({ length: 12 }, (_, i) => `Shop ${String(i).padStart(2, '0')}`)
    shops.push('RedGoblin')

    const { visible } = selectShopChips(shops, [row('RedGoblin (Lorcana)', 'a')])

    expect(visible[0]).toBe('RedGoblin')
  })

  it('cannot be crowded out: a full grid promotes at most four shops', () => {
    // CARD_COUNT rows at MAX_CARDS_PER_SHOP per shop bounds the promotion, so
    // volume order always keeps most of the list.
    const cards = Array.from({ length: CARD_COUNT }, (_, i) =>
      row(`Grid ${Math.floor(i / MAX_CARDS_PER_SHOP)}`, `t${i}`),
    )
    const shops = [
      ...Array.from({ length: 11 }, (_, i) => `Volume ${i}`),
      ...Array.from({ length: CARD_COUNT / MAX_CARDS_PER_SHOP }, (_, i) => `Grid ${i}`),
    ]

    const { visible } = selectShopChips(shops, cards)

    expect(visible.filter((s) => s.startsWith('Grid'))).toHaveLength(CARD_COUNT / MAX_CARDS_PER_SHOP)
    expect(visible.filter((s) => s.startsWith('Volume'))).toHaveLength(
      MAX_SHOP_CHIPS - CARD_COUNT / MAX_CARDS_PER_SHOP,
    )
  })

  it('survives an empty grid', () => {
    const { visible, hidden } = selectShopChips(['Krit', 'LexShop'], [])
    expect(visible).toEqual(['Krit', 'LexShop'])
    expect(hidden).toBe(0)
  })
})
