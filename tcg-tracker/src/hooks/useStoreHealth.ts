import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { GAMES, type GameInfo, type GameKey, type StoreHealthStatus } from '../components/packradar/tokens'
import { getStoreBaseName } from '../lib/storeName'

// Worse status wins when merging multiple game-rows of the same physical
// store — a Pokémon row being OK shouldn't hide a One Piece row that's DOWN.
const STATUS_SEVERITY: Record<StoreHealthStatus, number> = { OK: 0, SLOW: 1, DOWN: 2 }

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
// Stores sweep on a ~15 min cycle — give some slack before calling a store SLOW/DOWN.
const SLOW_THRESHOLD_MIN = 25
const DOWN_THRESHOLD_MIN = 90
// Recent-products dataset used to derive both "signals in the last 7 days" and
// "latest signal per store" from a single query, instead of one query per store.
const RECENT_PRODUCTS_LIMIT = 1000

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

    const [storesRes, runsRes, productsRes, inStockRes] = await Promise.all([
      supabase.from('stores').select('id, name, url').order('name'),
      supabase.from('scrape_runs').select('store_id, status, started_at').order('started_at', { ascending: false }).limit(500),
      supabase
        .from('products')
        .select('store_id, title, first_seen, game')
        .order('first_seen', { ascending: false })
        .limit(RECENT_PRODUCTS_LIMIT),
      // Explicit wide range rather than a default-limited select — this needs the
      // true total, not just a recent slice (Supabase defaults to a 1000-row cap).
      supabase.from('products').select('store_id').eq('in_stock', true).range(0, 9999),
    ])

    if (storesRes.error) {
      setError(storesRes.error.message)
      setLoading(false)
      return
    }
    if (runsRes.error) {
      setError(runsRes.error.message)
      setLoading(false)
      return
    }
    if (productsRes.error) {
      setError(productsRes.error.message)
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

    const latestRunByStore = new Map<string, { status: string; started_at: string }>()
    for (const run of runsRes.data) {
      if (!latestRunByStore.has(run.store_id)) {
        latestRunByStore.set(run.store_id, run)
      }
    }

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
      const latestRun = latestRunByStore.get(store.id)
      const latestProduct = latestProductByStore.get(store.id)

      // scrape_runs is RLS-restricted to authenticated users (it can carry internal
      // error messages), so the anon/public client never sees it here — `latestRun`
      // is always undefined on the public pages today. Falls back to treating
      // "last new product seen" as a loose proxy for store health until a real
      // data source is decided (see task: "Decide store health data source").
      let status: StoreHealthStatus
      if (latestRun) {
        const elapsedMin = (now - new Date(latestRun.started_at).getTime()) / 60000
        if (latestRun.status === 'failed') {
          status = 'DOWN'
        } else if (elapsedMin <= SLOW_THRESHOLD_MIN) {
          status = 'OK'
        } else if (elapsedMin <= DOWN_THRESHOLD_MIN) {
          status = 'SLOW'
        } else {
          status = 'DOWN'
        }
      } else if (latestProduct) {
        const elapsedHours = (now - new Date(latestProduct.first_seen).getTime()) / 3600000
        status = elapsedHours <= 48 ? 'OK' : elapsedHours <= 24 * 7 ? 'SLOW' : 'DOWN'
      } else {
        status = 'DOWN'
      }

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
        lastSweepAt: latestRun?.started_at ?? latestProduct?.first_seen ?? null,
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
      const status = rows.reduce<StoreHealthStatus>(
        (worst, r) => (STATUS_SEVERITY[r.status] > STATUS_SEVERITY[worst] ? r.status : worst),
        'OK',
      )
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
