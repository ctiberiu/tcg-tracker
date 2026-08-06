import { useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, ALLOWED_EMAIL } from '../lib/supabase'
import { RadarSpinner, CtaButton } from '../components/packradar'

const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  background: 'var(--pr-bg)',
  color: 'var(--pr-text-bright)',
  fontSize: 13,
  border: '1px solid var(--pr-border)',
  fontFamily: 'var(--pr-font-mono)',
  outline: 'none',
}

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
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

    navigate('/admin', { replace: true })
  }

  return (
    <div className="packradar" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <RadarSpinner size={34} />
          <span
            style={{
              fontFamily: 'var(--pr-font-display)',
              fontWeight: 700,
              fontSize: 22,
              color: 'var(--pr-text-bright)',
              letterSpacing: 0.5,
            }}
          >
            PackRadar
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--pr-signal)', letterSpacing: 2 }}>
            /// OPERATOR ACCESS
          </span>
        </div>

        <form onSubmit={handleSubmit} style={{ border: '1px solid var(--pr-border)', background: 'var(--pr-bg-panel)', padding: 28 }}>
          <div style={{ fontSize: 9.5, color: 'var(--pr-text-dim)', letterSpacing: 2, marginBottom: 18 }}>
            SIGN IN
          </div>

          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 12px',
                border: '1px solid var(--pr-status-gone)',
                color: 'var(--pr-status-gone)',
                fontSize: 12.5,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <input
              type="email"
              required
              maxLength={254}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={fieldStyle}
              autoComplete="email"
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <input
              type="password"
              required
              minLength={8}
              maxLength={128}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={fieldStyle}
              autoComplete="current-password"
            />
          </div>

          <CtaButton
            type="submit"
            variant="solid"
            disabled={loading}
            fullWidth
          >
            {loading ? 'SIGNING IN…' : 'SIGN IN'}
          </CtaButton>
        </form>
      </div>
    </div>
  )
}
