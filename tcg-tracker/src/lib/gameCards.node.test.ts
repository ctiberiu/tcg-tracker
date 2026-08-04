import { describe, it, expect } from 'vitest'
import { selectGameCards, isAccessoryTitle, MAX_CARDS_PER_SHOP, CARD_COUNT } from './gameCards'

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
