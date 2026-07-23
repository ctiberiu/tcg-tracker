import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { GAMES, type GameInfo, type GameKey, type StoreHealthStatus } from '../components/packradar/tokens'

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

    const healths: StoreHealth[] = storesRes.data.map((store) => {
      const latestRun = latestRunByStore.get(store.id)
      const latestProduct = latestProductByStore.get(store.id)

      // scrape_runs is RLS-restricted to authenticated users (it can carry internal
      // error messages), so the anon/public client never sees it here — `latestRun`
      // is always undefined on the public pages today. Falls back to treating
      // "last new product seen" as a loose proxy for store health until a real
      // data source is decided (see task: "Decide store health data source").
      let status: StoreHealthStatus
      let lastSweep: string
      if (latestRun) {
        lastSweep = formatElapsed(latestRun.started_at, now)
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
        lastSweep = formatElapsed(latestProduct.first_seen, now)
        const elapsedHours = (now - new Date(latestProduct.first_seen).getTime()) / 3600000
        status = elapsedHours <= 48 ? 'OK' : elapsedHours <= 24 * 7 ? 'SLOW' : 'DOWN'
      } else {
        status = 'DOWN'
        lastSweep = '—'
      }

      let domain = store.url
      try {
        domain = new URL(store.url).hostname
      } catch {
        // leave as raw url if it doesn't parse
      }

      return {
        id: store.id,
        name: store.name,
        domain,
        status,
        signals7d: signals7dByStore.get(store.id) ?? 0,
        lastSweep,
        lastSweepAt: latestRun?.started_at ?? latestProduct?.first_seen ?? null,
        lastSignal: latestProduct ? formatSignalDate(latestProduct.first_seen) : '—',
        latest: latestProduct?.title ?? '—',
        channels: Array.from(gamesByStore.get(store.id) ?? []).map((key) => GAMES[key]),
        inStockCount: inStockCountByStore.get(store.id) ?? 0,
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
