import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { SnipeTask } from '../lib/types'
import type { TaskPayload } from '../lib/snipe'

export function useSnipeTasks() {
  const [tasks, setTasks] = useState<SnipeTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from('snipe_tasks')
      .select('*')
      .order('created_at')

    if (error) {
      setError(error.message)
    } else {
      setTasks(data as SnipeTask[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // Fetch-on-mount — the repo's established data-hook pattern (see useStores /
    // useProducts / useSubscribers); setState happens after the await, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTasks()
  }, [fetchTasks])

  // user_id defaults to auth.uid() in the DB; RLS restricts rows to the owner.
  const addTask = async (payload: TaskPayload) => {
    const { error } = await supabase.from('snipe_tasks').insert(payload)
    if (error) throw new Error(error.message)
    await fetchTasks()
  }

  // Accepts task-field updates plus a live status change (from the extension).
  const updateTask = async (id: string, payload: Partial<TaskPayload> & Partial<Pick<SnipeTask, 'status'>>) => {
    const { error } = await supabase.from('snipe_tasks').update(payload).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchTasks()
  }

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from('snipe_tasks').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await fetchTasks()
  }

  return { tasks, loading, error, addTask, updateTask, deleteTask, refetch: fetchTasks }
}
