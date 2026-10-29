import { describe, it, expect, vi, afterEach } from 'vitest'
import { syncToSupabase, staleGraceMs, sweepCutoffMs } from './scraper.js'
import { noSweepSync } from './fast-lane.js'
import {
  LAST_SEEN_REFRESH_MS,
  URL_CHUNK,
  planProductWrites,
  changedColumns,
  toProductRow,
  formatSyncLine,
} from './product-sync.js'

/**
 * syncToSupabase stopped rewriting unchanged products (2026-10). Two things must
 * not move while the write volume drops:
 *   - what alerts: new-and-in-stock, and out -> in restocks, on both lanes
 *   - when the sweep calls a missing product out of stock: never sooner than the
 *     grace, even though last_seen_at is now refreshed at most hourly
 * These tests run the real syncToSupabase against an in-memory Supabase that
 * mimics the two products triggers and records every query.
 */

const MIN = 60_000
const NOW = Date.parse('2026-10-29T12:00:00.000Z')
const iso = (ms) => new Date(ms).toISOString()
const STORE = 'store-a'

/** A minimal PostgREST stand-in: from/select/in/eq/range/upsert/update/insert. */
function fakeSupabase({ products = [], stores = [{ id: STORE, check_interval_minutes: 15 }], failOn = null } = {}) {
  const db = { products: products.map((r) => ({ ...r })), stores, product_stock_events: [] }
  const calls = []
  let nextId = db.products.length + 1

  function upsertRow(row) {
    const old = db.products.find((r) => r.url === row.url)
    if (!old) {
      // migration 021: BEFORE INSERT stamps the clock for an out-of-stock insert
      const created = {
        id: `p${nextId++}`,
        first_seen: iso(NOW),
        ...row,
        out_of_stock_since: row.in_stock === false ? iso(NOW) : null,
      }
      db.products.push(created)
      return { ...created }
    }
    const next = { ...old, ...row }
    next.first_seen = old.first_seen // trg_preserve_first_seen
    // trg_set_out_of_stock_since, as amended by 036
    if (next.in_stock === false && old.in_stock === true) next.out_of_stock_since = iso(NOW)
    else if (next.in_stock === true) next.out_of_stock_since = null
    else next.out_of_stock_since = old.out_of_stock_since ?? next.last_seen_at
    Object.assign(old, next)
    return { ...old }
  }

  function run(q) {
    if (failOn && failOn(q)) return { data: null, error: { message: 'boom', code: 'XX000' } }
    const table = db[q.table]
    const match = (r) => q.filters.every((f) => f(r))
    let data = null
    if (q.op === 'select') {
      data = table.filter(match).map((r) => ({ ...r }))
      if (q.range) data = data.slice(q.range[0], q.range[1] + 1)
    } else if (q.op === 'upsert') {
      data = q.payload.map(upsertRow)
    } else if (q.op === 'update') {
      for (const r of table.filter(match)) Object.assign(r, q.payload)
    } else if (q.op === 'insert') {
      table.push(...q.payload)
    }
    calls.push({ table: q.table, op: q.op, in: q.in, eqs: q.eqs, payload: q.payload, rows: data?.length ?? 0 })
    return { data, error: null }
  }

  function from(table) {
    const q = { table, op: 'select', filters: [], eqs: [], in: null, payload: null, range: null }
    const b = {
      select() { return b },
      in(col, vals) { q.in = { col, values: [...vals] }; q.filters.push((r) => vals.includes(r[col])); return b },
      eq(col, v) { q.eqs.push(col); q.filters.push((r) => r[col] === v); return b },
      range(a, z) { q.range = [a, z]; return b },
      upsert(rows) { q.op = 'upsert'; q.payload = rows; return b },
      update(obj) { q.op = 'update'; q.payload = obj; return b },
      insert(rows) { q.op = 'insert'; q.payload = rows; return b },
      then(resolve, reject) {
        try { resolve(run(q)) } catch (e) { reject(e) }
      },
    }
    return b
  }

  return { client: { from }, db, calls }
}

/** A stored products row, in the shape the table holds it. */
const stored = (n, over = {}) => ({
  id: `p${n}`,
  url: `https://shop.example/p/${n}`,
  store_id: STORE,
  store_name: 'Shop',
  title: `Product ${n}`,
  price: 100 + n,
  image_url: `https://shop.example/i/${n}.jpg`,
  in_stock: true,
  game: 'pokemon',
  first_seen: iso(NOW - 30 * 24 * 60 * MIN),
  out_of_stock_since: null,
  last_seen_at: iso(NOW - 10 * MIN),
  ...over,
})

/** The scraped product that corresponds to a stored row, unchanged. */
const scraped = (row, over = {}) => ({
  store_id: row.store_id,
  store_name: row.store_name,
  title: row.title,
  price: row.price,
  url: row.url,
  image_url: row.image_url,
  in_stock: row.in_stock,
  game: row.game,
  ...over,
})

const productWrites = (calls) => calls.filter((c) => c.table === 'products' && c.op === 'upsert')
const writtenUrls = (calls) => productWrites(calls).flatMap((c) => c.payload.map((r) => r.url))
const sync = (fake, products, scrapedIds = [], sweepIds = scrapedIds, now = NOW) =>
  syncToSupabase(products, scrapedIds, sweepIds, { supabase: fake.client, now: () => now })

let logs = []
const captureLogs = () => {
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a) => logs.push(a.join(' ')))
}
afterEach(() => vi.restoreAllMocks())

describe('what gets written', () => {
  it('does not write an unchanged product seen within the refresh threshold', async () => {
    captureLogs()
    const row = stored(1, { last_seen_at: iso(NOW - LAST_SEEN_REFRESH_MS + 1) })
    const fake = fakeSupabase({ products: [row] })
    const res = await sync(fake, [scraped(row)])
    expect(productWrites(fake.calls)).toHaveLength(0)
    expect(fake.db.products[0].last_seen_at).toBe(row.last_seen_at)
    expect(res).toMatchObject({ inserted: 0, updated: 0, skipped: 1, alertProducts: [] })
  })

  it('refreshes an unchanged product once its last_seen_at reaches the threshold', async () => {
    captureLogs()
    const row = stored(1, { last_seen_at: iso(NOW - LAST_SEEN_REFRESH_MS) })
    const fake = fakeSupabase({ products: [row] })
    const res = await sync(fake, [scraped(row)])
    expect(writtenUrls(fake.calls)).toEqual([row.url])
    expect(fake.db.products[0].last_seen_at).toBe(iso(NOW))
    expect(res).toMatchObject({ updated: 1, skipped: 0, alertProducts: [] })
  })

  it.each([
    ['price', { price: 99.5 }],
    ['in_stock', { in_stock: false }],
    ['title', { title: 'Product 1 (restocked box)' }],
    ['image_url', { image_url: 'https://shop.example/i/new.jpg' }],
    ['game', { game: 'magic' }],
    ['store_id', { store_id: 'store-b' }],
  ])('writes a fresh product whose %s changed', async (col, change) => {
    captureLogs()
    const row = stored(1)
    const fake = fakeSupabase({ products: [row] })
    await sync(fake, [scraped(row, change)])
    expect(writtenUrls(fake.calls)).toEqual([row.url])
    expect(fake.db.products[0][col]).toBe(change[col])
    expect(fake.db.products[0].last_seen_at).toBe(iso(NOW))
  })

  it('writes a new product and alerts on it when in stock', async () => {
    captureLogs()
    const fake = fakeSupabase({ products: [stored(1)] })
    const fresh = scraped(stored(2))
    const res = await sync(fake, [scraped(stored(1)), fresh])
    expect(writtenUrls(fake.calls)).toEqual([fresh.url])
    expect(res.inserted).toBe(1)
    expect(res.alertProducts.map((p) => p.url)).toEqual([fresh.url])
    expect(fake.db.product_stock_events.map((e) => [e.url, e.event])).toEqual([
      [fresh.url, 'first_seen'],
      [fresh.url, 'in'],
    ])
  })

  it('writes a new out-of-stock product without alerting', async () => {
    captureLogs()
    const fake = fakeSupabase()
    const res = await sync(fake, [scraped(stored(3), { in_stock: false })])
    expect(res.inserted).toBe(1)
    expect(res.alertProducts).toEqual([])
  })

  it('writes a restock (out -> in) and alerts, logging how long it was out', async () => {
    captureLogs()
    const outSince = iso(NOW - 3 * 60 * MIN)
    const row = stored(1, { in_stock: false, out_of_stock_since: outSince })
    const fake = fakeSupabase({ products: [row] })
    const res = await sync(fake, [scraped(row, { in_stock: true })])
    expect(writtenUrls(fake.calls)).toEqual([row.url])
    expect(res.alertProducts.map((p) => p.url)).toEqual([row.url])
    expect(fake.db.product_stock_events).toMatchObject([{ url: row.url, event: 'in', out_since_at_event: outSince }])
  })

  it('writes a sellout the store reports (in -> out), logs it at the old price, and does not alert', async () => {
    captureLogs()
    const row = stored(1, { price: 120 })
    const fake = fakeSupabase({ products: [row] })
    const res = await sync(fake, [scraped(row, { in_stock: false, price: 0 })])
    expect(writtenUrls(fake.calls)).toEqual([row.url])
    expect(res.alertProducts).toEqual([])
    expect(fake.db.product_stock_events).toMatchObject([{ url: row.url, event: 'out', price_at_event: 120 }])
  })

  it('matches a scraped url to the stored one through normalizeProductUrl', async () => {
    captureLogs()
    // The RamCards case: the page links %C3%A9, the row holds %c3%a9.
    const row = stored(1, { url: 'https://www.ramcards.ro/pok%c3%a9mon-booster' })
    const fake = fakeSupabase({ products: [row] })
    const res = await sync(fake, [scraped(row, { url: 'https://www.ramcards.ro/Pok%C3%A9mon-Booster/?ref=x' })])
    expect(res).toMatchObject({ inserted: 0, skipped: 1, alertProducts: [] })
    expect(productWrites(fake.calls)).toHaveLength(0)
  })
})

describe('the read before the write', () => {
  it('reads only the scraped urls, never the whole table', async () => {
    captureLogs()
    const table = Array.from({ length: 500 }, (_, i) => stored(i + 1))
    const fake = fakeSupabase({ products: table })
    await sync(fake, [scraped(table[0]), scraped(table[1]), scraped(stored(9999))])
    const reads = fake.calls.filter((c) => c.table === 'products' && c.op === 'select')
    expect(reads).toHaveLength(1)
    expect(reads[0].in.col).toBe('url')
    expect(reads[0].in.values).toHaveLength(3)
    expect(reads[0].rows).toBe(2) // of 500 stored
  })

  it('chunks the url list and stays bounded by the number of scraped urls', async () => {
    captureLogs()
    const table = Array.from({ length: 300 }, (_, i) => stored(i + 1))
    const fake = fakeSupabase({ products: table })
    await sync(fake, table.slice(0, 95).map((r) => scraped(r)))
    const reads = fake.calls.filter((c) => c.table === 'products' && c.op === 'select')
    expect(reads.map((r) => r.in.values.length)).toEqual([URL_CHUNK, URL_CHUNK, 95 - 2 * URL_CHUNK])
    expect(reads.reduce((n, r) => n + r.rows, 0)).toBe(95)
    expect(logs).toContain(
      '  Products: 0/0 written (new 0, changed 0, refreshed 0), 95 skipped unchanged; read 95 existing row(s) for 95 scraped url(s) in 3 request(s)',
    )
  })

  it('throws a dbError when the read fails, so an outage is not taken for "everything is new"', async () => {
    captureLogs()
    const fake = fakeSupabase({ products: [stored(1)], failOn: (q) => q.table === 'products' && q.op === 'select' })
    await expect(sync(fake, [scraped(stored(1))])).rejects.toThrow(/Failed to fetch existing products/)
    expect(productWrites(fake.calls)).toHaveLength(0)
  })
})

describe('the per-run log line', () => {
  it('is printed with zeros when nothing was scraped', async () => {
    captureLogs()
    await sync(fakeSupabase(), [])
    expect(logs).toContain(
      '  Products: 0/0 written (new 0, changed 0, refreshed 0), 0 skipped unchanged; read 0 existing row(s) for 0 scraped url(s) in 0 request(s)',
    )
  })

  it('counts each kind of write and the skips', async () => {
    captureLogs()
    const unchanged = stored(1)
    const changed = stored(2)
    const due = stored(3, { last_seen_at: iso(NOW - 2 * LAST_SEEN_REFRESH_MS) })
    const fake = fakeSupabase({ products: [unchanged, changed, due] })
    await sync(fake, [scraped(unchanged), scraped(changed, { price: 1 }), scraped(due), scraped(stored(4))])
    expect(logs).toContain(
      '  Products: 3/3 written (new 1, changed 1, refreshed 1), 1 skipped unchanged; read 3 existing row(s) for 4 scraped url(s) in 1 request(s)',
    )
  })

  it('reports rows whose write failed', async () => {
    captureLogs()
    const fake = fakeSupabase({ failOn: (q) => q.op === 'upsert' })
    const res = await sync(fake, [scraped(stored(1))])
    expect(res.inserted).toBe(0)
    expect(logs).toContain(
      '  Products: 0/1 written (new 1, changed 0, refreshed 0, FAILED 1), 0 skipped unchanged; read 0 existing row(s) for 1 scraped url(s) in 1 request(s)',
    )
  })
})

describe('the staleness sweep never fires sooner than the grace', () => {
  const GRACE_15 = staleGraceMs(15) // 22.5 minutes

  /** A sweep of STORE where `absent` products are missing from this run. */
  async function sweepWith(absent) {
    captureLogs()
    const present = stored(100)
    const fake = fakeSupabase({ products: [present, ...absent] })
    await sync(fake, [scraped(present)], [STORE], [STORE])
    return Object.fromEntries(fake.db.products.map((r) => [r.id, r.in_stock]))
  }

  it('does NOT mark a product missing for exactly the old grace (old rule: stale)', async () => {
    const lastSeen = NOW - GRACE_15
    // Before this change the cutoff was now - grace and the test was <=, so this was swept.
    expect(lastSeen <= NOW - GRACE_15).toBe(true)
    const state = await sweepWith([stored(1, { last_seen_at: iso(lastSeen) })])
    expect(state.p1).toBe(true)
  })

  it('does not mark one whose stored last_seen_at trails by just under the refresh threshold', async () => {
    // Stored at now - grace - R + 1ms. It may have been seen up to R - 1ms after
    // that, i.e. as recently as now - grace + ... so it is not provably past grace.
    const state = await sweepWith([stored(1, { last_seen_at: iso(NOW - GRACE_15 - LAST_SEEN_REFRESH_MS + 1) })])
    expect(state.p1).toBe(true)
  })

  it('still marks one whose stored last_seen_at is grace + threshold old', async () => {
    const state = await sweepWith([stored(1, { last_seen_at: iso(NOW - GRACE_15 - LAST_SEEN_REFRESH_MS) })])
    expect(state.p1).toBe(false)
  })

  it('does not sweep a product that was present this run, however old its stored last_seen_at', async () => {
    captureLogs()
    const old = stored(1, { last_seen_at: iso(NOW - LAST_SEEN_REFRESH_MS + 1) })
    const fake = fakeSupabase({ products: [old] })
    await sync(fake, [scraped(old)], [STORE], [STORE], NOW + 5 * 60 * MIN)
    expect(fake.db.products[0].in_stock).toBe(true)
  })

  // The property, enumerated rather than argued. Every writer goes through
  // planProductWrites, so the stored value trails the true last sighting by a
  // lag in [0, R). For every true age and every such lag, a sweep under the new
  // cutoff implies a sweep under the old rule: never earlier.
  it.each([15, 30])('holds for every true age and stored lag at a %i-minute interval', (interval) => {
    const grace = staleGraceMs(interval)
    const oldSwept = (trueAge) => NOW - trueAge <= NOW - grace
    const newSwept = (storedAge) => NOW - storedAge <= sweepCutoffMs(NOW, interval)
    const lags = [0, 1, MIN, 30 * MIN, LAST_SEEN_REFRESH_MS - MIN, LAST_SEEN_REFRESH_MS - 1]
    let checked = 0
    for (let trueAge = 0; trueAge <= grace + 2 * LAST_SEEN_REFRESH_MS; trueAge += MIN / 2) {
      for (const lag of lags) {
        if (newSwept(trueAge + lag)) expect(oldSwept(trueAge)).toBe(true)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('delays detection by at most the refresh threshold', () => {
    expect(NOW - sweepCutoffMs(NOW, 15)).toBe(staleGraceMs(15) + LAST_SEEN_REFRESH_MS)
    expect(NOW - sweepCutoffMs(NOW, 30)).toBe(staleGraceMs(30) + LAST_SEEN_REFRESH_MS)
  })
})

describe('the skip rule holds the sweep invariant across runs', () => {
  // Simulate a product seen every `period` minutes for a day under the skip rule,
  // and check the stored value never trails the latest sighting by R or more.
  it.each([2, 4, 15, 18, 30, 45, 75])('stored last_seen_at always trails by < R at a %i-minute period', (period) => {
    let storedMs = NOW
    let writes = 0
    for (let t = NOW; t <= NOW + 24 * 60 * MIN; t += period * MIN) {
      const row = toProductRow({ title: 'x', price: 1, store_name: 's' }, 'u', iso(t))
      const { write } = planProductWrites([row], new Map([['u', { ...row, last_seen_at: iso(storedMs) }]]), t)
      if (write.length) {
        storedMs = t
        writes++
      }
      expect(t - storedMs).toBeLessThan(LAST_SEEN_REFRESH_MS)
    }
    expect(writes).toBeLessThanOrEqual(Math.ceil((24 * 60) / Math.max(period, 60)) + 1)
  })
})

describe('the fast lane (noSweepSync) on the same rule', () => {
  it('skips unchanged products, still alerts a restock, and never sweeps', async () => {
    captureLogs()
    const unchanged = stored(1)
    const restock = stored(2, { in_stock: false, out_of_stock_since: iso(NOW - 60 * MIN) })
    const gone = stored(3, { last_seen_at: iso(NOW - 24 * 60 * MIN) })
    const fake = fakeSupabase({ products: [unchanged, restock, gone] })
    const laneSync = noSweepSync((p, a, b) => syncToSupabase(p, a, b, { supabase: fake.client, now: () => NOW }))
    const res = await laneSync([scraped(unchanged), scraped(restock, { in_stock: true })])
    expect(writtenUrls(fake.calls)).toEqual([restock.url])
    expect(res.alertProducts.map((p) => p.url)).toEqual([restock.url])
    expect(fake.db.products.find((r) => r.id === 'p3').in_stock).toBe(true)
    expect(fake.calls.some((c) => c.table === 'stores')).toBe(false)
  })
})

describe('changedColumns', () => {
  const row = toProductRow(scraped(stored(1)), stored(1).url, iso(NOW))
  it('sees nothing when only last_seen_at differs', () => {
    expect(changedColumns(row, stored(1, { last_seen_at: iso(0) }))).toEqual([])
  })
  it('treats undefined and null as the same, and compares price by value', () => {
    expect(changedColumns({ ...row, image_url: undefined, price: null }, stored(1, { image_url: null, price: null }))).toEqual([])
    expect(changedColumns({ ...row, price: 49.9 }, stored(1, { price: 49.9 }))).toEqual([])
    expect(changedColumns({ ...row, price: null }, stored(1, { price: 0 }))).toEqual(['price'])
  })
  it('refreshes a row whose stored last_seen_at is unreadable rather than skipping it', () => {
    const { counts } = planProductWrites([row], new Map([[row.url, stored(1, { last_seen_at: null })]]), NOW)
    expect(counts).toMatchObject({ refreshed: 1, skipped: 0 })
  })
  it('formats the log line', () => {
    expect(
      formatSyncLine({ counts: { new: 0, changed: 0, refreshed: 0, skipped: 0 }, written: 0, failed: 0, read: { rows: 0, urls: 0, requests: 0 } }),
    ).toMatch(/^ {2}Products: 0\/0 written/)
  })
})
