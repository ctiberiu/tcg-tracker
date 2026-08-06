import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { GAMES, type GameInfo, type GameKey, type StoreHealthStatus } from '../components/packradar/tokens'
import { getStoreBaseName } from '../lib/storeName'
import { deriveStoreStatus, worstStatus } from '../lib/storeStatus'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

// PostgREST caps a single response at 1000 rows, so this dataset is paged.
//
// It used to be one `.limit(1000)` newest-first slice, which is a GLOBAL budget
// rather than a time window — and the derived values (signals in the last 7 days,
// latest signal per store, channel badges) are all per-store. Once total products
// passed ~1000 the slice stopped reaching every store: measured at 2385 products
// it covered only 7.2 days and 57 of the 67 stores that have products, so 12
// stores rendered with 0 signals and no latest signal despite having data.
//
// It also degraded silently and continuously — the window shrinks as volume grows,
// so `signals7d` would have quietly become a 5- then 3-day count with no error, and
// it crowded out low-volume stores first, which are exactly the ones a health page
// exists to surface. Paging by time-independent chunks decouples the window from
// total volume.
const PAGE_SIZE = 1000
// Safety ceiling on paging, so a runaway table can't hang a public page.
const MAX_PRODUCT_PAGES = 20

export interface StoreHealth {
  id: string
  name: string
  domain: string
  status: StoreHealthStatus
  signals7d: number
  lastSweep: string
  lastSweepAt: string | null
  lastSignal: string
  latest: string
  channels: GameInfo[]
  inStockCount: number
}

interface RecentProduct {
  store_id: string
  title: string
  first_seen: string
  game: string
}

/**
 * Every product row, newest first, paged past PostgREST's 1000-row cap. Stops at
 * MAX_PRODUCT_PAGES; the resulting slice is still newest-first, so a table that
 * ever outgrows the ceiling degrades the same way the old code did rather than
 * worse — but at 20x the headroom, and loudly (see the console warning).
 */
async function fetchRecentProducts(): Promise<{ data: RecentProduct[]; error: string | null }> {
  const rows: RecentProduct[] = []
  for (let page = 0; page < MAX_PRODUCT_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await supabase
      .from('products')
      .select('store_id, title, first_seen, game')
      .order('first_seen', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { data: [], error: error.message }
    rows.push(...(data as RecentProduct[]))
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null }
  }
  console.warn(
    `useStoreHealth: hit the ${MAX_PRODUCT_PAGES}-page ceiling (${MAX_PRODUCT_PAGES * PAGE_SIZE} products). ` +
      `Store signal counts may be under-reported — raise MAX_PRODUCT_PAGES or scope this query by time.`,
  )
  return { data: rows, error: null }
}

function formatElapsed(fromIso: string, now: number): string {
  const elapsedMin = Math.max(0, Math.round((now - new Date(fromIso).getTime()) / 60000))
  if (elapsedMin < 60) return `${elapsedMin}m`
  const elapsedHours = elapsedMin / 60
  if (elapsedHours < 48) return `${Math.round(elapsedHours)}h`
  return `${Math.round(elapsedHours / 24)}d`
}

function formatSignalDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' })
}

export function useStoreHealth() {
  const [storeHealths, setStoreHealths] = useState<StoreHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    setError(null)

    // scrape_runs is gone from this list. It was fetched to derive status, but the
    // table is RLS-restricted to authenticated users, so on the public pages it
    // returned an empty array every time and the code fell through to a
    // product-recency guess. Status now comes from the stores row itself.
    const [storesRes, productsRes, inStockRes] = await Promise.all([
      supabase
        .from('stores')
        .select('id, name, url, last_scraped_at, is_enabled, is_flagged, consecutive_failures')
        .order('name'),
      fetchRecentProducts(),
      // Explicit wide range rather than a default-limited select — this needs the
      // true total, not just a recent slice (Supabase defaults to a 1000-row cap).
      supabase.from('products').select('store_id').eq('in_stock', true).range(0, 9999),
    ])

    if (storesRes.error) {
      setError(storesRes.error.message)
      setLoading(false)
      return
    }
    if (productsRes.error) {
      // fetchRecentProducts returns a plain message string, not a PostgrestError.
      setError(productsRes.error)
      setLoading(false)
      return
    }
    if (inStockRes.error) {
      setError(inStockRes.error.message)
      setLoading(false)
      return
    }

    const now = Date.now()
    const sevenDaysAgo = now - SEVEN_DAYS_MS

    const latestProductByStore = new Map<string, { title: string; first_seen: string }>()
    const signals7dByStore = new Map<string, number>()
    const gamesByStore = new Map<string, Set<GameKey>>()
    for (const product of productsRes.data) {
      if (!latestProductByStore.has(product.store_id)) {
        latestProductByStore.set(product.store_id, product)
      }
      if (new Date(product.first_seen).getTime() >= sevenDaysAgo) {
        signals7dByStore.set(product.store_id, (signals7dByStore.get(product.store_id) ?? 0) + 1)
      }
      if (!gamesByStore.has(product.store_id)) gamesByStore.set(product.store_id, new Set())
      gamesByStore.get(product.store_id)!.add(product.game as GameKey)
    }

    const inStockCountByStore = new Map<string, number>()
    for (const product of inStockRes.data) {
      inStockCountByStore.set(product.store_id, (inStockCountByStore.get(product.store_id) ?? 0) + 1)
    }

    // A physical store has one `stores` row per game it's scraped for (see
    // storeName.ts) — compute health per row first, then merge rows sharing
    // a base name into a single card so "RedGoblin" and "RedGoblin (One
    // Piece)" don't show up as two separate stores.
    interface RowHealth {
      baseName: string
      domain: string
      status: StoreHealthStatus
      signals7d: number
      lastSweepAt: string | null
      latestProduct: { title: string; first_seen: string } | undefined
      games: Set<GameKey>
      inStockCount: number
    }

    const rowHealths: RowHealth[] = storesRes.data.map((store) => {
      const latestProduct = latestProductByStore.get(store.id)

      // Health comes from the scraper's own failure state, shared with
      // useSweepSummary so the two pages cannot disagree. It replaces a
      // product-recency fallback this code itself described as "a loose proxy
      // for store health until a real data source is decided" — that source is
      // is_enabled/is_flagged/consecutive_failures, which applyFailureOutcome
      // maintains and migration 015 makes anon-readable.
      //
      // The old rule conflated "we cannot reach this shop" with "this shop has
      // not restocked", so a healthy store with a quiet fortnight read DOWN. It
      // only ever ran because the scrape_runs query above is RLS-restricted and
      // returns nothing to an anonymous visitor.
      const status = deriveStoreStatus(store)

      let domain = store.url
      try {
        domain = new URL(store.url).hostname
      } catch {
        // leave as raw url if it doesn't parse
      }

      return {
        baseName: getStoreBaseName(store.name),
        domain,
        status,
        signals7d: signals7dByStore.get(store.id) ?? 0,
        lastSweepAt: store.last_scraped_at ?? null,
        latestProduct,
        games: gamesByStore.get(store.id) ?? new Set(),
        inStockCount: inStockCountByStore.get(store.id) ?? 0,
      }
    })

    const rowsByBaseName = new Map<string, RowHealth[]>()
    for (const row of rowHealths) {
      if (!rowsByBaseName.has(row.baseName)) rowsByBaseName.set(row.baseName, [])
      rowsByBaseName.get(row.baseName)!.push(row)
    }

    const healths: StoreHealth[] = Array.from(rowsByBaseName.entries()).map(([name, rows]) => {
      const status = worstStatus(rows.map((r) => r.status))
      const lastSweepAt = rows.reduce<string | null>((latest, r) => {
        if (!r.lastSweepAt) return latest
        if (!latest || new Date(r.lastSweepAt) > new Date(latest)) return r.lastSweepAt
        return latest
      }, null)
      const latestProduct = rows.reduce<RowHealth['latestProduct']>((latest, r) => {
        if (!r.latestProduct) return latest
        if (!latest || new Date(r.latestProduct.first_seen) > new Date(latest.first_seen)) return r.latestProduct
        return latest
      }, undefined)
      const games = new Set<GameKey>()
      for (const r of rows) for (const g of r.games) games.add(g)

      return {
        id: name,
        name,
        domain: rows[0].domain,
        status,
        signals7d: rows.reduce((sum, r) => sum + r.signals7d, 0),
        lastSweep: lastSweepAt ? formatElapsed(lastSweepAt, now) : '—',
        lastSweepAt,
        lastSignal: latestProduct ? formatSignalDate(latestProduct.first_seen) : '—',
        latest: latestProduct?.title ?? '—',
        channels: Array.from(games).map((key) => GAMES[key]),
        inStockCount: rows.reduce((sum, r) => sum + r.inStockCount, 0),
      }
    })

    // Signal-OK stores first, alphabetical within each group.
    healths.sort((a, b) => {
      const aOk = a.status === 'OK' ? 0 : 1
      const bOk = b.status === 'OK' ? 0 : 1
      if (aOk !== bOk) return aOk - bOk
      return a.name.localeCompare(b.name)
    })

    setStoreHealths(healths)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  const overallLastSweepAt = storeHealths.reduce<string | null>((latest, s) => {
    if (!s.lastSweepAt) return latest
    if (!latest || new Date(s.lastSweepAt) > new Date(latest)) return s.lastSweepAt
    return latest
  }, null)

  const healthy = storeHealths.every((s) => s.status !== 'DOWN')

  return { storeHealths, loading, error, overallLastSweepAt, healthy, refetch: fetchHealth }
}
