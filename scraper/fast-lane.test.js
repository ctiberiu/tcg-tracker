import { describe, it, expect, vi } from 'vitest'
import {
  FAST_LANE_STORES,
  FAST_LANE_CADENCE_MINUTES,
  resolveLane,
  isFastLaneDry,
  shouldScrapeThisRun,
  prepareFastLaneStores,
  noSweepSync,
  countWouldAlert,
  runFastLane,
} from './fast-lane.js'

/**
 * The fast lane scrapes page 1 of a few stores every ~2 minutes, in parallel
 * with the main scraper. Its danger is not being slow; it is doing something the
 * main scraper already does, in a way that corrupts it: sweeping a partial
 * scrape, running a full scrape in a second concurrency group, going live by
 * accident, or hammering a store the main scraper has already seen failing.
 * These tests pin each of those shut. Synthetic: no browser, network or DB.
 */

const row = (id, extra = {}) => ({
  id,
  name: `Store ${id}`,
  url: `https://${id}.test/list`,
  scraper_type: 'magento',
  game: 'pokemon',
  is_enabled: true,
  is_flagged: false,
  ...extra,
})
const product = (n, inStock = true) => ({ title: `Pokemon TCG ${n}`, url: `https://shop.test/p/${n}`, in_stock: inStock })
const quiet = () => {}
const noPause = async () => {}

describe('resolveLane', () => {
  it('runs the main scraper when unset', () => {
    expect(resolveLane(undefined)).toBe('main')
    expect(resolveLane('')).toBe('main')
  })

  it('runs the fast lane only for exactly "fast"', () => {
    expect(resolveLane('fast')).toBe('fast')
  })

  // A typo must not fall through to a full scrape inside the fast workflow's own
  // concurrency group, which would run beside the main job.
  it.each(['fsat', 'Fast', 'main', 'true'])('throws on %j instead of running a full scrape', (value) => {
    expect(() => resolveLane(value)).toThrow(/SCRAPE_LANE/)
  })
})

describe('isFastLaneDry', () => {
  it('goes live only on exactly "0"', () => {
    expect(isFastLaneDry('0')).toBe(false)
  })

  it.each([undefined, '', '1', 'false', 'off', 'no', ' 0'])('stays dry for %j', (value) => {
    expect(isFastLaneDry(value)).toBe(true)
  })
})

describe('shouldScrapeThisRun', () => {
  it('scrapes every run without everyMinutes', () => {
    expect(shouldScrapeThisRun({}, 0)).toBe(true)
    expect(shouldScrapeThisRun({ everyMinutes: FAST_LANE_CADENCE_MINUTES }, 60_000)).toBe(true)
  })

  it('scrapes an every-4-minutes store on half of the 2-minute runs', () => {
    const entry = { everyMinutes: 4 }
    const runs = Array.from({ length: 60 }, (_, i) => shouldScrapeThisRun(entry, i * 2 * 60_000))
    expect(runs.filter(Boolean)).toHaveLength(30)
  })
})

describe('prepareFastLaneStores', () => {
  const entries = [
    { id: 'a', name: 'A', url: 'https://a.test/newest' },
    { id: 'b', name: 'B' },
  ]

  it('applies the newest-first URL and page-1-only flag without mutating the row', () => {
    const rows = [row('a'), row('b')]
    const [a, b] = prepareFastLaneStores(rows, entries, { log: quiet })

    expect(a.url).toBe('https://a.test/newest')
    expect(b.url).toBe('https://b.test/list')
    expect(a.firstPageOnly).toBe(true)
    expect(b.firstPageOnly).toBe(true)
    expect(rows[0]).not.toHaveProperty('firstPageOnly')
    expect(rows[0].url).toBe('https://a.test/list')
  })

  it('keeps config order, not row order', () => {
    const out = prepareFastLaneStores([row('b'), row('a')], entries, { log: quiet })
    expect(out.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('skips disabled and flagged rows, and says so', () => {
    const log = vi.fn()
    const out = prepareFastLaneStores([row('a', { is_enabled: false }), row('b', { is_flagged: true })], entries, { log })

    expect(out).toEqual([])
    expect(log.mock.calls.flat().join('\n')).toMatch(/disabled[\s\S]*flagged/)
  })

  it('ignores rows that are not on the lane and reports configured ids with no row', () => {
    const log = vi.fn()
    const out = prepareFastLaneStores([row('a'), row('zzz')], entries, { log })

    expect(out.map((s) => s.id)).toEqual(['a'])
    expect(log.mock.calls.flat().join('\n')).toMatch(/B: no stores row/)
  })

  it('skips a store that is not due this run', () => {
    const slow = [{ id: 'a', name: 'A', everyMinutes: 4 }]
    const due = prepareFastLaneStores([row('a')], slow, { nowMs: 0, log: quiet })
    const notDue = prepareFastLaneStores([row('a')], slow, { nowMs: 2 * 60_000, log: quiet })
    expect(due).toHaveLength(1)
    expect(notDue).toHaveLength(0)
  })
})

describe('FAST_LANE_STORES', () => {
  it('has unique ids and https overrides', () => {
    expect(new Set(FAST_LANE_STORES.map((s) => s.id)).size).toBe(FAST_LANE_STORES.length)
    for (const s of FAST_LANE_STORES) {
      if (s.url) expect(new URL(s.url).protocol).toBe('https:')
    }
  })
})

describe('noSweepSync — the lane can never drive the staleness sweep', () => {
  it('passes empty scraped and sweepable store lists', async () => {
    const sync = vi.fn(async () => ({ alertProducts: [] }))
    const products = [product(1)]

    await noSweepSync(sync)(products)

    expect(sync).toHaveBeenCalledWith(products, [], [])
  })
})

describe('countWouldAlert', () => {
  it('counts new in-stock and restocked products, once each', () => {
    const existing = new Map([
      ['https://shop.test/p/2', false], // was out of stock -> restock
      ['https://shop.test/p/3', true], // already in stock -> nothing
    ])
    const products = [product(1), product(1), product(2), product(3), product(4, false)]

    const out = countWouldAlert(products, existing)

    expect(out).toMatchObject({ newInStock: 1, restocked: 1, total: 2 })
  })
})

describe('runFastLane', () => {
  const deps = (overrides = {}) => ({
    stores: [row('a'), row('b')],
    dry: true,
    fetchData: vi.fn(async (store) => ({ raw: [product(`${store.id}1`)], status: 200 })),
    keep: (_store, raw) => raw,
    readExisting: vi.fn(async () => new Map()),
    sync: vi.fn(async () => ({ alertProducts: [] })),
    notify: vi.fn(async () => {}),
    log: quiet,
    pause: noPause,
    ...overrides,
  })

  it('dry run: reads existing stock but never syncs or notifies', async () => {
    const d = deps()
    const out = await runFastLane(d)

    expect(d.readExisting).toHaveBeenCalledTimes(1)
    expect(d.sync).not.toHaveBeenCalled()
    expect(d.notify).not.toHaveBeenCalled()
    expect(out.wouldAlert.total).toBe(2)
  })

  it('live run: syncs the products and notifies only when something is alertable', async () => {
    const quietRun = deps({ dry: false })
    await runFastLane(quietRun)
    expect(quietRun.sync).toHaveBeenCalledTimes(1)
    expect(quietRun.notify).not.toHaveBeenCalled()

    const alerting = deps({ dry: false, sync: vi.fn(async (p) => ({ alertProducts: p.slice(0, 1) })) })
    await runFastLane(alerting)
    expect(alerting.notify).toHaveBeenCalledWith([product('a1')])
  })

  it('contributes nothing from a blocked store and keeps scraping the rest', async () => {
    const d = deps({
      dry: false,
      fetchData: vi.fn(async (store) =>
        store.id === 'a' ? { raw: [product('a1')], status: 403 } : { raw: [product('b1')], status: 200 },
      ),
    })

    const out = await runFastLane(d)

    expect(d.sync).toHaveBeenCalledWith([product('b1')])
    expect(out.report.map((r) => r.outcome)).toEqual(['block', 'success'])
  })

  it('survives a store that throws', async () => {
    const d = deps({
      fetchData: vi.fn(async (store) => {
        if (store.id === 'a') throw new Error('page.goto: Timeout 30000ms exceeded.')
        return { raw: [product('b1')], status: 200 }
      }),
    })

    const out = await runFastLane(d)

    expect(out.report.map((r) => r.outcome)).toEqual(['error', 'success'])
    expect(out.products).toEqual([product('b1')])
  })

  it('applies the store filter before counting', async () => {
    const d = deps({ keep: (_s, raw) => raw.filter((p) => p.title.endsWith('1') === false) })
    const out = await runFastLane(d)
    expect(out.products).toEqual([])
  })
})

describe('dry run matches products the way sync stores them', () => {
  // Real pair, 2026-09-15: RamCards links the page with uppercase percent-encoding,
  // and syncToSupabase stores normalizeProductUrl's lowercased form. Matching raw
  // urls reported 11 long-existing products as new.
  const scraped = 'https://www.ramcards.ro/pokemon-tcg/pok%C3%A9mon-tcg-chaos-rising-booster-bundle.html'
  const stored = 'https://www.ramcards.ro/pokemon-tcg/pok%c3%a9mon-tcg-chaos-rising-booster-bundle.html'
  const lower = (url) => url.toLowerCase()

  it('does not count a stored product as new when only the url form differs', () => {
    const existing = new Map([[stored, true]])
    const products = [{ title: 'Chaos Rising Booster Bundle', url: scraped, in_stock: true }]

    expect(countWouldAlert(products, existing).newInStock).toBe(1) // raw match: the bug
    expect(countWouldAlert(products, existing, lower).total).toBe(0)
  })

  it('asks readExisting for normalized urls', async () => {
    const readExisting = vi.fn(async () => new Map([[stored, true]]))

    const out = await runFastLane({
      stores: [row('a')],
      dry: true,
      fetchData: async () => ({ raw: [{ title: 'Pokemon TCG Chaos Rising', url: scraped, in_stock: true }], status: 200 }),
      keep: (_s, raw) => raw,
      readExisting,
      sync: vi.fn(),
      notify: vi.fn(),
      normalizeUrl: lower,
      log: quiet,
      pause: noPause,
    })

    expect(readExisting).toHaveBeenCalledWith([stored])
    expect(out.wouldAlert.total).toBe(0)
  })
})
