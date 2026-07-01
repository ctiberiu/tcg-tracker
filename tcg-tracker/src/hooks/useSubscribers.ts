import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Subscriber } from '../lib/types'

export function useSubscribers() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSubscribers = useCallback(async () => {
    const { data, error } = await supabase
      .from('subscribers')
      .select('*')
      .order('created_at')

    if (error) {
      setError(error.message)
    } else {
      setSubscribers(data as Subscriber[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSubscribers()
  }, [fetchSubscribers])

  const addSubscriber = async (email: string) => {
    const { error } = await supabase.from('subscribers').insert({ email })
    if (error) throw new Error(error.message)
    await fetchSubscribers()
  }

  const removeSubscriber = async (id: string) => {
    const { error } = await supabase.from('subscribers').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await fetchSubscribers()
  }

  return { subscribers, loading, error, addSubscriber, removeSubscriber, refetch: fetchSubscribers }
}
