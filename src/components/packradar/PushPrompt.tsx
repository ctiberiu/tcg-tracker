import { useCallback, useEffect, useState } from 'react'
import { usePushSubscription } from '../../hooks/usePushSubscription'
import type { GameKey } from './tokens'
import { PushSheet, type PushSheetMode } from './PushSheet'
import { OPEN_PUSH_SETTINGS_EVENT } from './pushSettings'

/**
 * The floating "turn on notifications" prompt, and the sheet behind it.
 *
 * Rendered ONCE, from App.tsx, rather than per page — a second instance would
 * mean two service worker registrations racing and two banners on screen.
 *
 * ── Why the prompt is delayed rather than shown on load ──────────────────────
 * Notification permission is ONE SHOT. A refusal cannot be re-requested from
 * JavaScript, ever: the user has to find it in browser settings, which nobody
 * does. So the single prompt this site will ever get must not be spent on
 * someone who has been on the page for 400ms and has no idea what PackRadar is
 * — the reflex there is to dismiss, and that reflex is permanent.
 *
 * The banner therefore waits for a signal that the visitor is actually reading:
 * meaningful scrolling, or a while spent on the page. It also never requests
 * permission itself. Tapping it opens the sheet, the visitor picks their games,
 * and only THAT confirmation spends the prompt — by which point they have
 * stated what they want and the OS dialog is expected.
 */

/** Scroll depth that counts as engagement. Roughly a screen and a half. */
const SCROLL_TRIGGER_PX = 600
/** Fallback for short pages where the scroll trigger is unreachable. */
const DWELL_TRIGGER_MS = 15_000

const DISMISS_KEY = 'packradar:push-prompt-dismissed-at'
/** Dismissal is a "not now", not a "never". Asking again in a month is fair. */
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * localStorage throws rather than returning null in Safari private browsing,
 * which is a real configuration on the platform this targets first. A crash here
 * would take out the banner and, being thrown during render, the page with it.
 */
function readDismissedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    return raw ? Number.parseInt(raw, 10) : null
  } catch {
    return null
  }
}

function writeDismissedAt(now: number) {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(now))
  } catch {
    /* Private browsing. The banner reappears next visit, which is acceptable —
     * losing the dismissal is a much smaller harm than throwing. */
  }
}

export function PushPrompt() {
  const { capability, subscribed, games, busy, error, enable, disable, updateGames } =
    usePushSubscription()

  const [engaged, setEngaged] = useState(false)
  /* Read during initialisation rather than in an effect. An effect would render
   * once with the wrong value first, and the wrong value here is "show the
   * banner" — a visitor who already dismissed it would see it flash back. */
  const [dismissed, setDismissed] = useState(() => {
    const at = readDismissedAt()
    return at !== null && Date.now() - at < DISMISS_TTL_MS
  })
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<PushSheetMode>('games')

  useEffect(() => {
    if (engaged) return
    const onScroll = () => {
      if (window.scrollY >= SCROLL_TRIGGER_PX) setEngaged(true)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    const timer = setTimeout(() => setEngaged(true), DWELL_TRIGGER_MS)
    // Handles a reload that restores a scrolled position, where no scroll event fires.
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      clearTimeout(timer)
    }
  }, [engaged])

  useEffect(() => {
    const open = () => {
      // The footer entry point must work whatever the device can do: an iPhone
      // in Safari gets the install steps, everyone else gets the game picker.
      setSheetMode(capability?.state === 'ios-needs-install' ? 'install' : 'games')
      setSheetOpen(true)
    }
    window.addEventListener(OPEN_PUSH_SETTINGS_EVENT, open)
    return () => window.removeEventListener(OPEN_PUSH_SETTINGS_EVENT, open)
  }, [capability])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    writeDismissedAt(Date.now())
  }, [])

  const handleConfirm = useCallback(
    async (selected: GameKey[]) => {
      // `enable` requests permission first and must stay in the click's gesture
      // context — see the comment on it. `updateGames` is the already-subscribed
      // path and needs no permission.
      const ok = subscribed ? await updateGames(selected) : await enable(selected)
      if (ok) {
        setSheetOpen(false)
        // A subscribed device must not keep being asked to subscribe.
        writeDismissedAt(Date.now())
        setDismissed(true)
      }
    },
    [subscribed, enable, updateGames],
  )

  const handleDisable = useCallback(async () => {
    const ok = await disable()
    if (ok) setSheetOpen(false)
  }, [disable])

  const state = capability?.state

  /* Which states may show a banner.
   *
   * `denied` is deliberately absent. The permission is gone and no banner can
   * bring it back, so showing one would nag a user about something they cannot
   * act on from the page. Same for `ios-too-old` and `unsupported`: there is
   * nothing to offer, so nothing is shown. */
  const canPrompt = state === 'ready' || state === 'ios-needs-install' || state === 'granted'
  const showBanner = canPrompt && !subscribed && !dismissed && engaged && !sheetOpen

  const openSheet = () => {
    setSheetMode(state === 'ios-needs-install' ? 'install' : 'games')
    setSheetOpen(true)
  }

  return (
    <>
      {showBanner && (
        <div className="pr-push-banner" role="region" aria-label="Stock notifications">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                color: 'var(--pr-text-bright)',
                fontSize: 13.5,
                fontWeight: 600,
                lineHeight: 1.4,
                marginBottom: 3,
              }}
            >
              Turn on stock notifications
            </div>
            <div style={{ color: 'var(--pr-text-dim)', fontSize: 11.5, lineHeight: 1.45 }}>
              {/* Never states how often the sweep runs — publishing the cadence
                * tells the shops exactly what to rate-limit. Same rule the game
                * pages follow (see gamePages.ts). */}
              {state === 'ios-needs-install'
                ? 'Add PackRadar to your Home Screen to get alerts the moment stock lands.'
                : 'Get alerted the moment a product is back in stock. No account needed.'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
            <button
              type="button"
              onClick={openSheet}
              style={{
                minHeight: 40,
                padding: '0 14px',
                background: 'var(--pr-signal)',
                border: 'none',
                color: 'var(--pr-bg)',
                fontFamily: 'var(--pr-font-mono)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Turn on
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss notification prompt"
              style={{
                minWidth: 40,
                minHeight: 40,
                background: 'none',
                border: 'none',
                color: 'var(--pr-text-dim)',
                fontSize: 16,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <PushSheet
        open={sheetOpen}
        mode={sheetMode}
        initialGames={games}
        busy={busy}
        error={error}
        subscribed={subscribed}
        onConfirm={handleConfirm}
        onDisable={handleDisable}
        onClose={() => setSheetOpen(false)}
      />
    </>
  )
}
