import { useState, type FormEvent } from 'react'
import { useSubscribers } from '../hooks/useSubscribers'
import { useAuth } from '../hooks/useAuth'
import { CtaButton, fieldStyle, sectionTitleStyle, errorBoxStyle, smallLinkButtonStyle } from './packradar'

export function ManageEmails() {
  const { subscribers, loading, error, addSubscriber, removeSubscriber } = useSubscribers()
  const { session } = useAuth()
  const myEmail = session?.user?.email?.toLowerCase() ?? ''

  const [newEmail, setNewEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testMsg, setTestMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null)

  const handleTest = async (id: string, email: string) => {
    setTestingId(id)
    setTestMsg(null)
    try {
      const res = await fetch('/api/send-test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setTestMsg({ id, text: `Sent — ${data.count} products`, ok: true })
    } catch (err) {
      setTestMsg({ id, text: err instanceof Error ? err.message : 'Failed to send', ok: false })
    } finally {
      setTestingId(null)
    }
  }

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const email = newEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Enter a valid email address')
      return
    }
    if (subscribers.some((s) => s.email.toLowerCase() === email)) {
      setFormError('That email is already on the list')
      return
    }
    setBusy(true)
    try {
      await addSubscriber(email)
      setNewEmail('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add email')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from stock alerts?`)) return
    try {
      await removeSubscriber(id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove email')
    }
  }

  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ ...sectionTitleStyle, marginBottom: 6 }}>Manage Emails</h2>
      <p style={{ color: 'var(--pr-text-dim)', fontSize: 12.5, marginBottom: 16 }}>
        Everyone here receives the stock alert emails.
      </p>

      {error && (
        <div style={{ ...errorBoxStyle, marginBottom: 16 }}>Failed to load emails: {error}</div>
      )}

      <form onSubmit={handleAdd} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="name@example.com"
          maxLength={254}
          style={{ ...fieldStyle, width: 'auto', minWidth: 240 }}
        />
        <CtaButton type="submit" variant="solid" size="sm" disabled={busy}>
          + ADD EMAIL
        </CtaButton>
      </form>
      {formError && <p style={{ color: 'var(--pr-status-gone)', fontSize: 12.5, marginBottom: 12 }}>{formError}</p>}

      {loading ? (
        <p style={{ color: 'var(--pr-text-dim)', fontSize: 13 }}>Loading emails...</p>
      ) : subscribers.length === 0 ? (
        <p style={{ color: 'var(--pr-text-dim)', fontSize: 13 }}>No emails yet.</p>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560, marginTop: 12 }}>
          {subscribers.map((s) => {
            const isMine = s.email.toLowerCase() === myEmail
            return (
              <li
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid var(--pr-border)',
                  background: 'var(--pr-bg-panel)',
                  padding: '10px 14px',
                }}
              >
                <span style={{ color: 'var(--pr-text-bright)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.email}
                  {isMine && (
                    <span style={{ marginLeft: 8, color: 'var(--pr-text-dim)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
                      (you)
                    </span>
                  )}
                  {!s.is_active && <span style={{ marginLeft: 8, color: 'var(--pr-status-gone)', fontSize: 11 }}>inactive</span>}
                  {testMsg?.id === s.id && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: testMsg.ok ? 'var(--pr-signal)' : 'var(--pr-status-gone)' }}>
                      {testMsg.text}
                    </span>
                  )}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, marginLeft: 12 }}>
                  <button onClick={() => handleTest(s.id, s.email)} disabled={testingId === s.id} style={smallLinkButtonStyle}>
                    {testingId === s.id ? 'Sending...' : 'Test'}
                  </button>
                  {!isMine && (
                    <button onClick={() => handleRemove(s.id, s.email)} style={smallLinkButtonStyle}>
                      Remove
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
