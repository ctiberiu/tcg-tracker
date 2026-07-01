import { useState } from 'react'
import { useSubscribers } from '../hooks/useSubscribers'
import { useAuth } from '../hooks/useAuth'

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

  const handleAdd = async (e: React.FormEvent) => {
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
    <section className="mb-12">
      <h2 className="font-headline text-2xl font-bold text-on-surface mb-2">
        Manage Emails
      </h2>
      <p className="text-on-surface-variant text-sm mb-4">
        Everyone here receives the stock alert emails.
      </p>

      {error && (
        <div className="p-3 rounded-lg bg-error/10 text-error text-sm mb-4">
          Failed to load emails: {error}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-3 mb-2">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="name@example.com"
          maxLength={254}
          className="px-3 py-2 rounded-lg bg-surface-low text-on-surface text-sm outline-none focus:ring-1 focus:ring-primary min-w-[240px]"
        />
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-primary text-on-primary font-headline font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          + Add Email
        </button>
      </form>
      {formError && <p className="text-error text-sm mb-3">{formError}</p>}

      {loading ? (
        <p className="text-on-surface-variant text-sm">Loading emails...</p>
      ) : subscribers.length === 0 ? (
        <p className="text-on-surface-variant text-sm">No emails yet.</p>
      ) : (
        <ul className="space-y-2 max-w-xl mt-3">
          {subscribers.map((s) => {
            const isMine = s.email.toLowerCase() === myEmail
            return (
              <li
                key={s.id}
                className="flex items-center justify-between bg-surface-low rounded-lg px-4 py-3"
              >
                <span className="text-on-surface text-sm truncate">
                  {s.email}
                  {isMine && (
                    <span className="ml-2 text-on-surface-variant text-xs uppercase tracking-wider">
                      (you)
                    </span>
                  )}
                  {!s.is_active && <span className="ml-2 text-error text-xs">inactive</span>}
                  {testMsg?.id === s.id && (
                    <span className={`ml-2 text-xs ${testMsg.ok ? 'text-primary' : 'text-error'}`}>
                      {testMsg.text}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <button
                    onClick={() => handleTest(s.id, s.email)}
                    disabled={testingId === s.id}
                    className="text-on-surface-variant hover:text-primary text-sm transition-colors disabled:opacity-50"
                  >
                    {testingId === s.id ? 'Sending...' : 'Test'}
                  </button>
                  {!isMine && (
                    <button
                      onClick={() => handleRemove(s.id, s.email)}
                      className="text-on-surface-variant hover:text-error text-sm transition-colors"
                    >
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
