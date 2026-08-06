import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { SnipeFlow } from '../lib/types'
import type { FlowPayload } from '../lib/snipe'

export function useSnipeFlows() {
  const [flows, setFlows] = useState<SnipeFlow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFlows = useCallback(async () => {
    const { data, error } = await supabase
      .from('snipe_flows')
      .select('*')
      .order('created_at')

    if (error) {
      setError(error.message)
    } else {
      setFlows(data as SnipeFlow[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // Fetch-on-mount — the repo's established data-hook pattern (see useStores /
    // useProducts / useSubscribers); setState happens after the await, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFlows()
  }, [fetchFlows])

  // user_id defaults to auth.uid() in the DB; RLS restricts rows to the owner.
  const addFlow = async (payload: FlowPayload) => {
    const { error } = await supabase.from('snipe_flows').insert(payload)
    if (error) throw new Error(error.message)
    await fetchFlows()
  }

  const updateFlow = async (id: string, payload: Partial<FlowPayload>) => {
    const { error } = await supabase.from('snipe_flows').update(payload).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchFlows()
  }

  const deleteFlow = async (id: string) => {
    const { error } = await supabase.from('snipe_flows').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await fetchFlows()
  }

  return { flows, loading, error, addFlow, updateFlow, deleteFlow, refetch: fetchFlows }
}
