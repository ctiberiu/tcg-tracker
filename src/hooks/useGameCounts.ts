import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { GAMES, type GameKey } from '../components/packradar/tokens'

export interface GameCountFilters {
  storeIds?: string[]
  minPrice?: number
  maxPrice?: number
  inStockOnly?: boolean
  search?: string
}

const GAME_KEYS = Object.keys(GAMES) as GameKey[]

/**
 * Per-game product counts, independent of any active game filter — so the
 * channel row can keep every game visible/clickable even while one is
 * selected. Applies every OTHER active filter (store/price/search/in-stock)
 * so counts stay accurate, just never the game filter itself. One cheap
 * HEAD-only count query per game key, run in parallel — no row data
 * transferred, just counts.
 */
export function useGameCounts(filters: GameCountFilters = {}) {
  const [counts, setCounts] = useState<Partial<Record<GameKey, number>>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function fetchCounts() {
      const entries = await Promise.all(
        GAME_KEYS.map(async (game) => {
          let query = supabase.from('products').select('*', { count: 'exact', head: true }).eq('game', game)
          if (filters.storeIds && filters.storeIds.length > 0) query = query.in('store_id', filters.storeIds)
          if (filters.minPrice != null) query = query.gte('price', filters.minPrice)
          if (filters.maxPrice != null) query = query.lte('price', filters.maxPrice)
          if (filters.inStockOnly) query = query.eq('in_stock', true)
          if (filters.search) query = query.ilike('title', `%${filters.search}%`)
          const { count } = await query
          return [game, count ?? 0] as const
        }),
      )
      if (!cancelled) {
        setCounts(Object.fromEntries(entries))
        setLoading(false)
      }
    }

    fetchCounts()
    return () => {
      cancelled = true
    }
  }, [filters.storeIds?.join(','), filters.minPrice, filters.maxPrice, filters.inStockOnly, filters.search])

  return { counts, loading }
}
