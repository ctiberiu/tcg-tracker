import { describe, it, expect, vi, afterEach } from 'vitest'
import { scrapeShopify, PAGINATION_MAX_PAGES } from './scraper.js'

/**
 * `scrapeShopify` fetched exactly one page of `products.json?limit=250` and
 * stopped. Shopify caps a response at 250 regardless of `limit`, so every
 * collection deeper than that was silently truncated: measured 2026-08-06,
 * RedGoblin's Magic collection holds 827 products over 4 pages and the scraper
 * was returning the first 250 — the cap, to the row.
 *
 * These run against a stubbed fetch. The store is not being hit; what is under
 * test is the walk, its stop conditions and its failure handling.
 */

const store = { name: 'TestShop', id: 'store-1', url: 'https://example.test/collections/magic' }

/** n products with distinct handles, all in stock. */
const page = (n, offset = 0) => ({
  products: Array.from({ length: n }, (_, i) => ({
    title: `Magic: The Gathering Booster ${offset + i}`,
    handle: `p${offset + i}`,
    variants: [{ price: '10.00', available: true }],
    images: [{ src: 'https://example.test/img.png' }],
  })),
})

/** Serves the given page bodies in order, then empty pages. */
function stubFetch(pages) {
  const calls = []
  vi.stubGlobal('fetch', async (url) => {
    calls.push(url)
    const n = Number(new URL(url).searchParams.get('page') ?? 1)
    const body = pages[n - 1] ?? { products: [] }
    return { ok: true, status: 200, text: async () => JSON.stringify(body) }
  })
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('scrapeShopify pagination', () => {
  it('walks past the 250 cap and returns every page', async () => {
    const calls = stubFetch([page(250, 0), page(250, 250), page(77, 500)])

    const { products } = await scrapeShopify(null, store)

    expect(products).toHaveLength(577)
    expect(new Set(products.map((p) => p.url)).size).toBe(577)
    // Three requests, not four: page 3 came back short, which is the last page.
    // Asking for page 4 to hear "nothing" is a request per store per run that
    // page 3 already answered.
    expect(calls).toHaveLength(3)
  })

  // The case that made this a bug rather than a limitation: one request, 250
  // rows, no signal anywhere that more existed.
  it('no longer stops at exactly 250 when more pages exist', async () => {
    stubFetch([page(250, 0), page(10, 250)])
    const { products } = await scrapeShopify(null, store)
    expect(products.length).toBeGreaterThan(250)
  })

  // Costs nothing where nothing is wrong: Arcana Inn's 15-product collection
  // must not pay for a second request that can only return nothing.
  it('does not request page 2 when page 1 came back short', async () => {
    const calls = stubFetch([page(15, 0)])

    const { products } = await scrapeShopify(null, store)

    expect(products).toHaveLength(15)
    expect(calls).toHaveLength(1)
  })

  // A shop clamping an out-of-range page back to the last valid one, a rejected
  // page param and a genuine last page are indistinguishable from here, and all
  // three must stop. Without this the walk would run to the cap re-adding rows
  // it already has.
  it('stops when a page repeats handles it has already seen', async () => {
    const repeated = page(250, 0)
    const calls = stubFetch([repeated, repeated, repeated])

    const { products } = await scrapeShopify(null, store)

    expect(products).toHaveLength(250)
    expect(calls).toHaveLength(2)
  })

  it('honours the page cap on a catalogue deeper than it', async () => {
    const deep = Array.from({ length: 10 }, (_, i) => page(250, i * 250))
    const calls = stubFetch(deep)

    const { products } = await scrapeShopify(null, store)

    expect(calls).toHaveLength(PAGINATION_MAX_PAGES)
    expect(products).toHaveLength(250 * PAGINATION_MAX_PAGES)
  })

  // A later page failing must not throw away page 1. The caller classifies a
  // throw as a transient failure, and page 1 already proved the store is
  // reachable — losing 250 good products and taking a strike for it would be
  // strictly worse than returning what we have.
  it('keeps the pages it already has when a later page errors', async () => {
    let call = 0
    vi.stubGlobal('fetch', async (url) => {
      call++
      if (call === 1) return { ok: true, status: 200, text: async () => JSON.stringify(page(250, 0)) }
      throw new Error('socket hang up')
    })

    const { products, status } = await scrapeShopify(null, { ...store })

    expect(products).toHaveLength(250)
    expect(status).toBe(200)
  })

  it('keeps the pages it already has when a later page returns a non-200', async () => {
    let call = 0
    vi.stubGlobal('fetch', async () => {
      call++
      return call === 1
        ? { ok: true, status: 200, text: async () => JSON.stringify(page(250, 0)) }
        : { ok: false, status: 429, text: async () => '' }
    })

    const { products } = await scrapeShopify(null, store)

    expect(products).toHaveLength(250)
  })

  // Block detection reads page 1's own response, and must keep doing so.
  it('still reports a page 1 block without paginating', async () => {
    const calls = []
    vi.stubGlobal('fetch', async (url) => {
      calls.push(url)
      return { ok: false, status: 403, text: async () => 'Just a moment...' }
    })

    const { products, status } = await scrapeShopify(null, store)

    expect(products).toEqual([])
    expect(status).toBe(403)
    expect(calls).toHaveLength(1)
  })
})
