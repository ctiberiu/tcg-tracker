import { describe, it, expect } from 'vitest'
import { resolveBebeteiUrl } from './scraper.js'

/**
 * BebeTei returned 0 products from a page showing 16, from 2026-08-04 15:01Z
 * until it was auto-disabled. The shop had turned each card's
 * `.product-image-listing` from `<a href>` into `<div data-href>`, and the
 * scraper read `.href`. classifyOutcome then counted every empty result as a
 * block. These attribute sets are real, captured from
 * https://comenzi.bebetei.ro/cauti/pokemon%20tcg on 2026-09-15.
 */

const origin = 'https://comenzi.bebetei.ro'
const liveCard = {
  href: null,
  dataHref:
    'https://comenzi.bebetei.ro/jocuri-si-jucarii/jocuri/jocuri-de-societate/set-10-carti-tcg-me05-pitch-black-boosters-pokemon-p479112',
  anchorHref:
    'https://comenzi.bebetei.ro/jocuri-si-jucarii/jocuri/jocuri-de-societate/set-10-carti-tcg-me05-pitch-black-boosters-pokemon-p479112',
}

describe('resolveBebeteiUrl', () => {
  // THE REGRESSION: today's markup, where the old `.href` read is null.
  it('reads data-href from the current <div> markup', () => {
    expect(resolveBebeteiUrl(liveCard, origin)).toBe(liveCard.dataHref)
  })

  it('still reads href from the old <a> markup', () => {
    expect(resolveBebeteiUrl({ href: 'https://comenzi.bebetei.ro/x-p1', dataHref: null, anchorHref: null }, origin)).toBe(
      'https://comenzi.bebetei.ro/x-p1',
    )
  })

  it('falls back to the card anchor when the listing element carries no link', () => {
    expect(resolveBebeteiUrl({ href: null, dataHref: null, anchorHref: liveCard.anchorHref }, origin)).toBe(liveCard.anchorHref)
  })

  it('resolves relative links against the shop origin', () => {
    expect(resolveBebeteiUrl({ href: null, dataHref: '/jocuri/p42', anchorHref: null }, origin)).toBe(
      'https://comenzi.bebetei.ro/jocuri/p42',
    )
  })

  it('skips placeholder links and uses the next real one', () => {
    expect(resolveBebeteiUrl({ href: '#', dataHref: 'javascript:void(0)', anchorHref: '/real-p7' }, origin)).toBe(
      'https://comenzi.bebetei.ro/real-p7',
    )
  })

  it('returns null when a card has no link at all, so the card is skipped', () => {
    expect(resolveBebeteiUrl({ href: null, dataHref: '  ', anchorHref: null }, origin)).toBeNull()
    expect(resolveBebeteiUrl(undefined, origin)).toBeNull()
  })
})
