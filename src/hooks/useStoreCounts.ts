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
 * The counting happens in Postgres, in `store_product_counts` (migration 041):
 * it applies the page's filters to `products` and returns one row per matching
 * store row, rather than one row per product. What it replaced asked for the
 * `store_id` of every matching product and counted the rows in the browser,
 * bounded by a `.range()`. PostgREST enforces its row cap server-side, so that
 * bound could not raise it — once the filters matched more rows than the cap,
 * the response was truncated with no error and the counts were understated,
 * by an amount that depended on the planner because the query had no ORDER BY.
 *
 * A failed call — including the function not existing yet — puts a message in
 * `error` and leaves `counts` empty. Render a count as unknown rather than as 0
 * whenever `loading` or `error` is set: inside `counts`, a store that is absent
 * matched no products, which is a different claim from not having asked. There
 * is deliberately no fallback to the row query; that query was the bug.
 */
export function useStoreCounts(stores: Store[], filters: StoreCountFilters = {}) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Keyed on the request body itself, so the effect refetches exactly when what
  // is sent to Postgres changes — not when a caller builds a new filters object
  // holding the same values.
  const argsKey = JSON.stringify(storeProductCountsArgs(filters))

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function fetchCounts() {
      const args: StoreProductCountsArgs = JSON.parse(argsKey)
      const { data, error: rpcError } = await supabase.rpc('store_product_counts', args)
      if (cancelled) return

      if (rpcError || !data) {
        setCounts({})
        setError(rpcError?.message ?? 'store_product_counts returned no data')
        setLoading(false)
        return
      }

      setCounts(sumCountsByBaseName(data as StoreProductCount[], stores))
      setError(null)
      setLoading(false)
    }

    fetchCounts()
    return () => {
      cancelled = true
    }
  }, [stores, argsKey])

  return { counts, loading, error }
}
