import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getStoreBaseName } from '../lib/storeName'
import { deriveStoreStatus, worstStatus } from '../lib/storeStatus'
import type { StoreHealthStatus } from '../components/packradar/tokens'

/**
 * The cheap read path, for pages that render a summary strip rather than
 * per-store detail.
 *
 * `useStoreHealth` pages the ENTIRE products table — three round trips — because
 * `/stores` needs each store's latest product title, its channel set and its
 * in-stock count. The landing page and the signal log need none of that: between
 * them they render a store count, a health dot, the last sweep time, and six
 * store names with a 7-day signal count. They were paying for the full read to
 * get it.
 *
 * Measured over the wire (gzip/br, real endpoints):
 *
 *   before   7 requests   78.5 kB   (580.4 kB decoded)
 *   after    2 requests    7.9 kB   ( 62.2 kB decoded)
 *
 * The decoded figure matters as much as the wire one here: 580 kB of JSON.parse
 * and the garbage it produces is real work on a mid-range phone, and it happened
 * on the site's first impression and crawl entry point.
 *
 * `useStoreHealth` is deliberately NOT weakened — `/stores` keeps every field it
 * renders. This is a second, narrower read path, not a downgrade of the shared
 * one.
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
/** PostgREST caps a response at 1000 rows; the 7-day window is well inside that,
 *  but ask explicitly rather than relying on the default. */
const SIGNAL_ROW_CAP = 10000

export interface StoreSummary {
  name: string
  status: StoreHealthStatus
  signals7d: number
  lastSweepAt: string | null
  /** Pre-formatted elapsed time ("12m", "3h", "2d"), matching useStoreHealth. */
  lastSweep: string
}

/** Same formatting useStoreHealth uses, so the two paths render identically. */
function formatElapsed(fromIso: string | null, now: number): string {
  if (!fromIso) return '—'
  const elapsedMin = Math.max(0, Math.round((now - new Date(fromIso).getTime()) / 60000))
  if (elapsedMin < 60) return `${elapsedMin}m`
  const elapsedHours = elapsedMin / 60
  if (elapsedHours < 48) return `${Math.round(elapsedHours)}h`
  return `${Math.round(elapsedHours / 24)}d`
}

export function useSweepSummary() {
  const [stores, setStores] = useState<StoreSummary[]>([])
  const [overallLastSweepAt, setOverallLastSweepAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    setError(null)

    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString()

    const [storesRes, signalsRes] = await Promise.all([
      // Health comes from the scraper's own failure state, which lives on these
      // columns and is readable by anon (migration 015). No products needed.
      supabase
        .from('stores')
        .select('id, name, last_scraped_at, is_enabled, is_flagged, consecutive_failures')
        .order('name'),
      // Only store_id, and only the 7-day window — this is a GROUP BY count done
      // client-side. Selecting titles here is what made the old path expensive.
      supabase
        .from('products')
        .select('store_id')
        .gte('first_seen', sevenDaysAgo)
        .range(0, SIGNAL_ROW_CAP - 1),
    ])

    if (storesRes.error) {
      setError(storesRes.error.message)
      setLoading(false)
      return
    }
    if (signalsRes.error) {
      setError(signalsRes.error.message)
      setLoading(false)
      return
    }

    const signalsByStoreId = new Map<string, number>()
    for (const row of signalsRes.data) {
      if (!row.store_id) continue
      signalsByStoreId.set(row.store_id, (signalsByStoreId.get(row.store_id) ?? 0) + 1)
    }

    // One `stores` row per shop per game, so merge on base name — "RedGoblin" and
    // "RedGoblin (One Piece)" are one shop. Worst status wins, so a healthy
    // Pokemon row cannot hide a blocked One Piece row.
    const rowsByName = new Map<string, { status: StoreHealthStatus; signals: number; lastSweepAt: string | null }[]>()
    for (const store of storesRes.data) {
      const baseName = getStoreBaseName(store.name)
      if (!rowsByName.has(baseName)) rowsByName.set(baseName, [])
      rowsByName.get(baseName)!.push({
        status: deriveStoreStatus(store),
        signals: signalsByStoreId.get(store.id) ?? 0,
        lastSweepAt: store.last_scraped_at ?? null,
      })
    }

    const now = Date.now()
    const summaries: StoreSummary[] = Array.from(rowsByName.entries()).map(([name, rows]) => {
      const lastSweepAt = rows.reduce<string | null>((latest, r) => {
        if (!r.lastSweepAt) return latest
        if (!latest || new Date(r.lastSweepAt) > new Date(latest)) return r.lastSweepAt
        return latest
      }, null)
      return {
        name,
        status: worstStatus(rows.map((r) => r.status)),
        signals7d: rows.reduce((sum, r) => sum + r.signals, 0),
        lastSweepAt,
        lastSweep: formatElapsed(lastSweepAt, now),
      }
    })

    summaries.sort((a, b) => a.name.localeCompare(b.name))

    setStores(summaries)
    setOverallLastSweepAt(
      summaries.reduce<string | null>((latest, s) => {
        if (!s.lastSweepAt) return latest
        if (!latest || new Date(s.lastSweepAt) > new Date(latest)) return s.lastSweepAt
        return latest
      }, null),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchSummary()
  }, [fetchSummary])

  const healthy = stores.length > 0 && stores.every((s) => s.status === 'OK')
  const respondingCount = stores.filter((s) => s.status === 'OK').length

  return { stores, storeCount: stores.length, healthy, respondingCount, overallLastSweepAt, loading, error }
}
