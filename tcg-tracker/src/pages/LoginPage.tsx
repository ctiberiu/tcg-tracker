import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, ALLOWED_EMAIL } from '../lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (email.toLowerCase() !== ALLOWED_EMAIL) {
      setError('Invalid credentials')
      setLoading(false)
      return
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('Invalid credentials')
      setLoading(false)
      return
    }

    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-md text-center">
        <h1 className="font-headline font-black text-3xl text-on-surface uppercase tracking-tight mb-2">
          TCG Tracker
        </h1>
        <p className="text-primary text-xs font-body uppercase tracking-widest mb-10">
          Track prices. Spot deals. Stay ahead.
        </p>
        <form onSubmit={handleSubmit} className="bg-surface-low rounded-xl p-8">
          <h2 className="font-headline text-xl font-bold text-on-surface mb-6">
            Sign In
          </h2>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-error/10 text-error text-sm">
              {error}
            </div>
          )}
          <div className="mb-4">
            <input
              type="email"
              required
              maxLength={254}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 font-body text-sm focus:outline-none focus:border-primary transition-colors"
              autoComplete="email"
            />
          </div>
          <div className="mb-6">
            <input
              type="password"
              required
              minLength={8}
              maxLength={128}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 font-body text-sm focus:outline-none focus:border-primary transition-colors"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-primary text-on-primary font-headline font-bold text-sm uppercase tracking-wider hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
