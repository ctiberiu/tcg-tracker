import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Product } from '../lib/types'

const PAGE_SIZE = 100

export type ProductSort = 'newest' | 'price_asc' | 'price_desc'

export interface ProductFilters {
  store?: string
  minPrice?: number
  maxPrice?: number
  inStockOnly?: boolean
  search?: string
  sort?: ProductSort
}

export function useProducts(filters: ProductFilters = {}) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Track current filters to detect changes
  const filtersRef = useRef(filters)

  const buildQuery = useCallback((from: number, to: number, withCount = false) => {
    let query = supabase
      .from('products')
      .select('*', withCount ? { count: 'exact' } : undefined)
      .range(from, to)

    switch (filters.sort) {
      case 'price_asc':
        query = query.order('price', { ascending: true, nullsFirst: false })
        break
      case 'price_desc':
        query = query.order('price', { ascending: false, nullsFirst: false })
        break
      case 'newest':
      default:
        query = query.order('first_seen', { ascending: false })
        break
    }

    if (filters.store) {
      query = query.eq('store_name', filters.store)
    }
    if (filters.minPrice != null) {
      query = query.gte('price', filters.minPrice)
    }
    if (filters.maxPrice != null) {
      query = query.lte('price', filters.maxPrice)
    }
    if (filters.inStockOnly) {
      query = query.eq('in_stock', true)
    }
    if (filters.search) {
      query = query.ilike('title', `%${filters.search}%`)
    }

    return query
  }, [filters.store, filters.minPrice, filters.maxPrice, filters.inStockOnly, filters.search, filters.sort])

  useEffect(() => {
    // Reset when filters change
    filtersRef.current = filters
    setProducts([])
    setHasMore(true)
    setLoading(true)
    setError(null)

    async function fetchInitial() {
      const { data, error, count } = await buildQuery(0, PAGE_SIZE - 1, true)

      if (error) {
        setError(error.message)
      } else {
        setProducts(data as Product[])
        setHasMore(data.length === PAGE_SIZE)
        setTotalCount(count ?? null)
      }
      setLoading(false)
    }

    fetchInitial()
  }, [buildQuery])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return

    setLoadingMore(true)
    const from = products.length
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)

    if (error) {
      setError(error.message)
    } else {
      setProducts((prev) => [...prev, ...(data as Product[])])
      setHasMore(data.length === PAGE_SIZE)
    }
    setLoadingMore(false)
  }, [products.length, loadingMore, hasMore, buildQuery])

  return { products, loading, loadingMore, hasMore, totalCount, error, loadMore }
}
