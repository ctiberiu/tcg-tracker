import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { GameKey } from '../components/packradar/tokens'
import type { Store } from '../lib/types'
import { getStoreBaseName } from '../lib/storeName'

export interface StoreCountFilters {
  games?: GameKey[]
  minPrice?: number
  maxPrice?: number
  inStockOnly?: boolean
  search?: string
}

/**
 * Per-store-base-name product counts, independent of the store filter itself
 * — mirrors useGameCounts but for the Store dropdown checklist. The products
 * table is small (hundreds of rows), so one query pulling store_id for the
 * matching rows and aggregating client-side beats one HEAD-count query per
 * store (up to 88 of them).
 */
export function useStoreCounts(stores: Store[], filters: StoreCountFilters = {}) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function fetchCounts() {
      let query = supabase.from('products').select('store_id').range(0, 4999)
      if (filters.games && filters.games.length > 0) query = query.in('game', filters.games)
      if (filters.minPrice != null) query = query.gte('price', filters.minPrice)
      if (filters.maxPrice != null) query = query.lte('price', filters.maxPrice)
      if (filters.inStockOnly) query = query.eq('in_stock', true)
      if (filters.search) query = query.ilike('title', `%${filters.search}%`)

      const { data, error } = await query
      if (cancelled) return

      if (error || !data) {
        setCounts({})
        setLoading(false)
        return
      }

      const idToBaseName = new Map(stores.map((s) => [s.id, getStoreBaseName(s.name)]))
      const result: Record<string, number> = {}
      for (const row of data as { store_id: string | null }[]) {
        if (!row.store_id) continue
        const baseName = idToBaseName.get(row.store_id)
        if (!baseName) continue
        result[baseName] = (result[baseName] ?? 0) + 1
      }
      setCounts(result)
      setLoading(false)
    }

    fetchCounts()
    return () => {
      cancelled = true
    }
  }, [stores, filters.games?.join(','), filters.minPrice, filters.maxPrice, filters.inStockOnly, filters.search])

  return { counts, loading }
}
