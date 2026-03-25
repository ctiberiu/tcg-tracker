import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, ALLOWED_EMAIL } from '../lib/supabase'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user.email?.toLowerCase() !== ALLOWED_EMAIL) {
        supabase.auth.signOut()
        setSession(null)
      } else {
        setSession(session)
      }
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && session.user.email?.toLowerCase() !== ALLOWED_EMAIL) {
        supabase.auth.signOut()
        setSession(null)
        return
      }
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
  }

  return { session, loading, signOut }
}
