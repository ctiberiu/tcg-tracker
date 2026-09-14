import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Store, StoreProductCount } from '../lib/types'
import {
  storeProductCountsArgs,
  sumCountsByBaseName,
  type StoreCountFilters,
  type StoreProductCountsArgs,
} from '../lib/storeCounts'

export type { StoreCountFilters }

/**
 * Per-store-base-name product counts, independent of the store filter itself
 * — mirrors useGameCounts but for the Store dropdown checklist.
 *
 * Counted in Postgres by `store_product_counts` (migration 041), which returns
 * one row per store row with a match, never one per product. This replaced
 * pulling `store_id` for every matching product with `.range(0, 4999)` and
 * counting in the browser, on the grounds that "the products table is small
 * (hundreds of rows)". PostgREST's 1000-row cap is server-side, so the range
 * never applied: on 2026-09-14 the unfiltered query got 1000 of 3912 rows, and
 * the in-stock query /view actually sends was three rows short of the cap.
 *
 * A failed call, including the function not existing yet, leaves `counts`
 * empty. There is deliberately no fallback to the row query; that query was the
 * bug.
 */
export function useStoreCounts(stores: Store[], filters: StoreCountFilters = {}) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  // Keyed on the request body itself, so the effect refetches exactly when what
  // is sent to Postgres changes — not when a caller builds a new filters object
  // holding the same values.
  const argsKey = JSON.stringify(storeProductCountsArgs(filters))

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function fetchCounts() {
      const args: StoreProductCountsArgs = JSON.parse(argsKey)
      const { data, error } = await supabase.rpc('store_product_counts', args)
      if (cancelled) return

      if (error || !data) {
        setCounts({})
        setLoading(false)
        return
      }

      setCounts(sumCountsByBaseName(data as StoreProductCount[], stores))
      setLoading(false)
    }

    fetchCounts()
    return () => {
      cancelled = true
    }
  }, [stores, argsKey])

  return { counts, loading }
}
