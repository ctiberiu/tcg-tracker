import { describe, it, expect, vi, afterEach } from 'vitest'
import { paginateUntilExhausted, PAGINATION_MAX_PAGES, PAGINATION_MIN_PAGE_1 } from './scraper.js'

/**
 * Scrape depth used to be a function of live inventory: the walk refused to go
 * past page 1 unless page 1 was 100% in stock. One item selling out collapsed a
 * 4-page walk to one page, 24-96 products dropped out of that run, the
 * staleness sweep marked them out of stock because they genuinely were absent,
 * and the next saturated run alerted every one of them as a restock.
 *
 * Confirmed live on Krit Magic, 2026-08-06: observed depths of 1, 3, 4 and 5
 * pages on an unchanged catalogue; run 31123987664 marked 15 products stale
 * after a shallow walk, and run 31115497528 alerted 15 as restocked after a
 * deep one.
 *
 * The two properties below are what stop that. Depth depends only on catalogue
 * size, and a walk that did not reach the end says so, because the sweep's
 * inference ("absent from this run" means "gone") is only sound for a run that
 * covered the same ground as the last one.
 */

const store = { name: 'TestShop', id: 's1', url: 'https://example.test/list', scraper_type: 'krit' }

const item = (n, inStock = true) => ({
  title: `Magic: The Gathering Booster ${n}`,
  url: `https://example.test/p/${n}`,
  in_stock: inStock,
})

/** A full page: exactly enough to clear the short-page check. */
const fullPage = (offset, inStock = true) =>
  Array.from({ length: PAGINATION_MIN_PAGE_1 }, (_, i) => item(offset + i, inStock))

/**
 * Drives the walk over a scripted list of pages. `pages[0]` is page 1 and is
 * passed in directly, as the real caller does; the rest are served by scrapeFn
 * in order of navigation.
 */
function walker(pages) {
  const gotos = []
  const page = {
    goto: vi.fn(async (url) => {
      gotos.push(url)
    }),
  }
  const scrapeFn = vi.fn(async () => {
    const n = gotos.length + 1 // page 1 was never navigated to here
    const body = pages[n - 1]
    if (body instanceof Error) throw body
    return body ?? []
  })
  return { page, scrapeFn, gotos }
}

afterEach(() => vi.unstubAllGlobals())

/** The walk sleeps 2-5s between pages. Tests do not need to wait for that. */
function withoutPacing() {
  vi.stubGlobal('setTimeout', (fn) => {
    fn()
    return 0
  })
}

describe('depth does not depend on live stock', () => {
  // THE PROPERTY THE EPIC ASKS FOR. Same catalogue, same pages, only the stock
  // flags differ — the run must see exactly the same products either way.
  it('walks the same catalogue whether or not page 1 is fully in stock', async () => {
    withoutPacing()

    const saturated = walker([fullPage(0, true), fullPage(10, true), []])
    const notSaturated = walker([
      // One item on page 1 sold out. That is the entire difference.
      [...fullPage(0, true).slice(0, -1), item(9, false)],
      fullPage(10, true),
      [],
    ])

    const a = await paginateUntilExhausted(saturated.page, store, saturated.scrapeFn, fullPage(0, true))
    const b = await paginateUntilExhausted(notSaturated.page, store, notSaturated.scrapeFn, [
      ...fullPage(0, true).slice(0, -1),
      item(9, false),
    ])

    expect(a.products.map((p) => p.url)).toEqual(b.products.map((p) => p.url))
    expect(saturated.gotos.length).toBe(notSaturated.gotos.length)
  })

  // The old behaviour, stated as the regression it would be: an out-of-stock
  // item on page 1 must not stop the walk.
  it('still fetches page 2 when page 1 contains an out-of-stock item', async () => {
    withoutPacing()
    const w = walker([null, fullPage(10, true), []])

    const { products } = await paginateUntilExhausted(w.page, store, w.scrapeFn, [
      ...fullPage(0, true).slice(0, -1),
      item(9, false),
    ])

    expect(w.gotos.length).toBeGreaterThan(0)
    expect(products).toHaveLength(PAGINATION_MIN_PAGE_1 * 2)
  })

  it('costs nothing on a store whose page 1 is short', async () => {
    withoutPacing()
    const w = walker([])

    const { products, complete } = await paginateUntilExhausted(w.page, store, w.scrapeFn, [item(1), item(2)])

    expect(w.gotos).toHaveLength(0)
    expect(products).toHaveLength(2)
    expect(complete).toBe(true)
  })

  it('does not walk a self-paginating scraper', async () => {
    withoutPacing()
    const w = walker([fullPage(10)])

    const { complete } = await paginateUntilExhausted(
      w.page,
      { ...store, scraper_type: 'woocommerce' },
      w.scrapeFn,
      fullPage(0),
    )

    expect(w.gotos).toHaveLength(0)
    expect(complete).toBe(true)
  })
})

describe('a partial walk reports itself as partial', () => {
  it('is complete when a rendered page yields no new URLs', async () => {
    withoutPacing()
    // Page 2 clamps back to page 1's content: rendered, nothing new, end.
    const w = walker([null, fullPage(0)])

    const { complete } = await paginateUntilExhausted(w.page, store, w.scrapeFn, fullPage(0))

    expect(complete).toBe(true)
  })

  // THE CASE THAT COST 15 PRODUCTS. A scrape function whose selector wait
  // expires returns [] and logs "No products found or page timed out". That is
  // indistinguishable from a genuine empty page past the end, so it must not be
  // read as proof the catalogue ended.
  it('is partial when a page returns nothing at all', async () => {
    withoutPacing()
    const w = walker([null, []])

    const { products, complete } = await paginateUntilExhausted(w.page, store, w.scrapeFn, fullPage(0))

    expect(complete).toBe(false)
    // The products it did collect are still returned and still synced.
    expect(products).toHaveLength(PAGINATION_MIN_PAGE_1)
  })

  it('is partial when a page fails to navigate', async () => {
    withoutPacing()
    const w = walker([null, new Error('net::ERR_TIMED_OUT')])

    const { products, complete } = await paginateUntilExhausted(w.page, store, w.scrapeFn, fullPage(0))

    expect(complete).toBe(false)
    expect(products).toHaveLength(PAGINATION_MIN_PAGE_1)
  })

  // Stopped by policy while the catalogue was still yielding — pages beyond the
  // cap were never looked at, so their products are not evidence of anything.
  it('is partial on a cap-hit', async () => {
    withoutPacing()
    const deep = Array.from({ length: PAGINATION_MAX_PAGES + 3 }, (_, i) => fullPage(i * 10))
    const w = walker(deep)

    const { products, complete } = await paginateUntilExhausted(w.page, store, w.scrapeFn, deep[0])

    expect(complete).toBe(false)
    expect(products).toHaveLength(PAGINATION_MIN_PAGE_1 * PAGINATION_MAX_PAGES)
  })

  it('reaches the cap only after fetching every page up to it', async () => {
    withoutPacing()
    const deep = Array.from({ length: PAGINATION_MAX_PAGES + 3 }, (_, i) => fullPage(i * 10))
    const w = walker(deep)

    await paginateUntilExhausted(w.page, store, w.scrapeFn, deep[0])

    expect(w.gotos).toHaveLength(PAGINATION_MAX_PAGES - 1)
  })
})

describe('fast lane: page 1 only', () => {
  it('never navigates past page 1 and reports the walk as partial', async () => {
    withoutPacing()
    const w = walker([null, fullPage(10), fullPage(20)])

    const { products, complete } = await paginateUntilExhausted(w.page, { ...store, firstPageOnly: true }, w.scrapeFn, fullPage(0))

    expect(w.gotos).toHaveLength(0)
    expect(products).toHaveLength(PAGINATION_MIN_PAGE_1)
    // Partial even though page 1 was all it fetched: the pages it skipped were
    // never looked at, so nothing may read their absence as a stock-out.
    expect(complete).toBe(false)
  })

  it('still walks for the main scraper', async () => {
    withoutPacing()
    const w = walker([null, fullPage(10), []])

    await paginateUntilExhausted(w.page, store, w.scrapeFn, fullPage(0))

    expect(w.gotos.length).toBeGreaterThan(0)
  })
})
