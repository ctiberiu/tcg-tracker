import { useEffect, useState } from 'react'
import { GAMES, type GameKey } from './tokens'
import { FilterCheckbox } from './FilterCheckbox'
import { StatusDot } from './StatusDot'
import { SUBSCRIBABLE_GAMES } from '../../lib/push'

// Keep in sync with the transition duration on .pr-filter-sheet in packradar.css.
// Reuses that class outright rather than defining a second sheet animation.
const TRANSITION_MS = 260

export type PushSheetMode = 'install' | 'games'

interface PushSheetProps {
  open: boolean
  /**
   * 'install' — iOS Safari tab. Add to Home Screen instructions, no permission
   *             request, because none is possible until the app is installed.
   * 'games'   — the device can subscribe. Pick games, THEN request permission.
   */
  mode: PushSheetMode
  initialGames: GameKey[]
  busy: boolean
  error: string | null
  /** Already subscribed: the sheet becomes a settings screen with a way out. */
  subscribed: boolean
  onConfirm: (games: GameKey[]) => void
  onDisable: () => void
  onClose: () => void
}

/**
 * The iOS Add to Home Screen walkthrough.
 *
 * This exists because there is no API for it. Safari will not let a page trigger
 * installation, prompt for it, or even detect that the Share sheet was opened —
 * so the only thing that can be built is instructions, and their quality is the
 * entire conversion rate of the feature on iPhone. Deliberately verbatim about
 * what the user will see ("Share", "Add to Home Screen") rather than
 * paraphrasing, because they are matching these words against a menu.
 *
 * Step 3 is the one people miss: notifications only work in the INSTALLED app,
 * so returning to Safari and tapping the button again fails in exactly the same
 * way. Stated explicitly rather than implied.
 */
const INSTALL_STEPS: { title: string; body: string }[] = [
  {
    title: 'Tap the Share button',
    body: 'It is in the Safari toolbar, at the bottom of the screen on iPhone and at the top on iPad.',
  },
  {
    title: 'Choose "Add to Home Screen"',
    body: 'Scroll down the share list to find it, then tap "Add" in the top-right corner.',
  },
  {
    title: 'Open PackRadar from your Home Screen',
    body: 'Notifications only work in the installed app. Come back here from the new icon and the button below will turn them on.',
  },
]

/** iOS Share glyph, drawn rather than described so people can match it visually. */
function ShareIcon() {
  return (
    <svg width="16" height="20" viewBox="0 0 16 20" fill="none" aria-hidden="true">
      <path
        d="M8 1.5v11M8 1.5 4.75 4.75M8 1.5l3.25 3.25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 8.5H1.75v9.75h12.5V8.5H13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PushSheet({
  open,
  mode,
  initialGames,
  busy,
  error,
  subscribed,
  onConfirm,
  onDisable,
  onClose,
}: PushSheetProps) {
  const [selected, setSelected] = useState<GameKey[]>(initialGames)

  // Same mount-past-close pattern as MobileFilterSheet, for the same reason: a
  // CSS keyframe animation needs the element to survive the close.
  const [rendered, setRendered] = useState(open)
  const [phase, setPhase] = useState<'entering' | 'exiting'>('entering')

  useEffect(() => {
    if (open) {
      setRendered(true)
      setPhase('entering')
      return
    }
    if (!rendered) return
    setPhase('exiting')
    const timeout = setTimeout(() => setRendered(false), TRANSITION_MS)
    return () => clearTimeout(timeout)
  }, [open, rendered])

  // Re-seed from props each time the sheet opens, so reopening shows what is
  // actually stored rather than an abandoned edit from the previous visit.
  useEffect(() => {
    if (open) setSelected(initialGames)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!rendered) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [rendered])

  if (!rendered) return null

  const toggle = (key: GameKey) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  const allSelected = selected.length === SUBSCRIBABLE_GAMES.length

  return (
    <div
      className={`pr-filter-sheet pr-filter-sheet--${phase} pr-push-sheet`}
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'install' ? 'Install PackRadar' : 'Stock notifications'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'var(--pr-popover-bg)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--pr-border)',
          flex: 'none',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--pr-font-display)',
            fontWeight: 700,
            fontSize: 19,
            color: 'var(--pr-text-bright)',
          }}
        >
          {mode === 'install' ? 'Add to Home Screen' : 'Stock notifications'}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--pr-text-mid)',
            fontSize: 18,
            cursor: 'pointer',
            minWidth: 44,
            minHeight: 44,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '20px 20px 0' }}>
        {mode === 'install' ? (
          <>
            <p style={{ color: 'var(--pr-text-mid)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 22px' }}>
              iPhone and iPad only allow notifications for apps on the Home Screen. It takes about
              fifteen seconds, and PackRadar can then alert you the moment a product is back in
              stock.
            </p>

            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {INSTALL_STEPS.map((step, index) => (
                <li
                  key={step.title}
                  style={{ display: 'flex', gap: 14, marginBottom: 22, alignItems: 'flex-start' }}
                >
                  <span
                    style={{
                      flex: 'none',
                      width: 26,
                      height: 26,
                      display: 'grid',
                      placeItems: 'center',
                      border: '1px solid var(--pr-active-border)',
                      background: 'var(--pr-active-bg)',
                      color: 'var(--pr-signal)',
                      fontFamily: 'var(--pr-font-mono)',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {index + 1}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        color: 'var(--pr-text-bright)',
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      {step.title}
                      {index === 0 && (
                        <span style={{ color: 'var(--pr-signal)', display: 'inline-flex' }}>
                          <ShareIcon />
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        color: 'var(--pr-text-dim)',
                        fontSize: 12.5,
                        lineHeight: 1.6,
                      }}
                    >
                      {step.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--pr-text-mid)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 6px' }}>
              {subscribed
                ? 'You are getting alerts for these games on this device.'
                : 'Pick the games you care about. You can change this later.'}
            </p>
            <p style={{ color: 'var(--pr-text-dim)', fontSize: 12, lineHeight: 1.6, margin: '0 0 18px' }}>
              Alerts are tied to this device only. No account and no email address.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
              <button
                type="button"
                onClick={() => setSelected(allSelected ? [] : [...SUBSCRIBABLE_GAMES])}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--pr-text-mid)',
                  fontFamily: 'var(--pr-font-mono)',
                  fontSize: 11,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  minHeight: 36,
                }}
              >
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 20 }}>
              {SUBSCRIBABLE_GAMES.map((key) => {
                const game = GAMES[key]
                const checked = selected.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    aria-pressed={checked}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      minHeight: 46,
                      padding: '8px 10px',
                      background: checked ? '#ffffff08' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <FilterCheckbox checked={checked} color={game.color} />
                    <StatusDot color={game.color} size={7} />
                    <span
                      style={{
                        flex: 1,
                        color: game.color,
                        fontSize: 12,
                        letterSpacing: 0.5,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                      }}
                    >
                      {game.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {error && (
          <p
            role="alert"
            style={{
              color: 'var(--pr-status-gone)',
              fontSize: 12.5,
              lineHeight: 1.5,
              margin: '0 0 16px',
            }}
          >
            {error}
          </p>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 16,
          borderTop: '1px solid var(--pr-border)',
          flex: 'none',
        }}
      >
        {mode === 'install' ? (
          <button
            type="button"
            onClick={onClose}
            style={primaryButtonStyle}
          >
            Got it
          </button>
        ) : (
          <>
            <button
              type="button"
              /* This click is what spends the one-shot permission prompt, which
               * is why the games are chosen first: by the time it is tapped the
               * user has stated what they want, so the dialog is expected rather
               * than an interruption. A refusal here can never be re-requested. */
              onClick={() => onConfirm(selected)}
              disabled={busy || selected.length === 0}
              style={{
                ...primaryButtonStyle,
                opacity: busy || selected.length === 0 ? 0.5 : 1,
                cursor: busy || selected.length === 0 ? 'default' : 'pointer',
              }}
            >
              {busy
                ? 'Working…'
                : selected.length === 0
                  ? 'Pick at least one game'
                  : subscribed
                    ? 'Save changes'
                    : 'Turn on notifications'}
            </button>
            {subscribed && (
              <button type="button" onClick={onDisable} disabled={busy} style={secondaryButtonStyle}>
                Turn off on this device
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const primaryButtonStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 48,
  background: 'var(--pr-signal)',
  border: 'none',
  color: 'var(--pr-bg)',
  fontFamily: 'var(--pr-font-mono)',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: 'uppercase',
  cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 44,
  background: 'transparent',
  border: '1px solid var(--pr-border)',
  color: 'var(--pr-text-mid)',
  fontFamily: 'var(--pr-font-mono)',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 1,
  textTransform: 'uppercase',
  cursor: 'pointer',
}
