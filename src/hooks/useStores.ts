import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Store } from '../lib/types'

export function useStores() {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStores = useCallback(async () => {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .order('name')

    if (error) {
      setError(error.message)
    } else {
      setStores(data as Store[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  const addStore = async (store: Omit<Store, 'id' | 'created_at'>) => {
    const { error } = await supabase.from('stores').insert(store)
    if (error) throw new Error(error.message)
    await fetchStores()
  }

  const updateStore = async (id: string, updates: Partial<Store>) => {
    const { error } = await supabase.from('stores').update(updates).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchStores()
  }

  const deleteStore = async (id: string) => {
    const { error } = await supabase.from('stores').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await fetchStores()
  }

  return { stores, loading, error, addStore, updateStore, deleteStore, refetch: fetchStores }
}
