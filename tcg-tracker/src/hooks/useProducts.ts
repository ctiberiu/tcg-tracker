import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Product } from '../lib/types'

const PAGE_SIZE = 100

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchInitial() {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('first_seen', { ascending: false })
        .range(0, PAGE_SIZE - 1)

      if (error) {
        setError(error.message)
      } else {
        setProducts(data as Product[])
        setHasMore(data.length === PAGE_SIZE)
      }
      setLoading(false)
    }

    fetchInitial()
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return

    setLoadingMore(true)
    const from = products.length
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('first_seen', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      setError(error.message)
    } else {
      setProducts((prev) => [...prev, ...(data as Product[])])
      setHasMore(data.length === PAGE_SIZE)
    }
    setLoadingMore(false)
  }, [products.length, loadingMore, hasMore])

  return { products, loading, loadingMore, hasMore, error, loadMore }
}
