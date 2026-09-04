import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Routes a notification tap to the right page.
 *
 * ── Why this is more than a message listener ─────────────────────────────────
 * Neither documented way of handing a URL to an installed iOS web app is
 * reliable:
 *
 *   clients.openWindow(url)  commonly launches the app at its start_url and
 *                            silently discards the deep link
 *   client.navigate(url)     unsupported in standalone mode on several iOS
 *                            versions, where it rejects instead of navigating
 *   client.postMessage(...)  needs the page's listener to be mounted already,
 *                            which it is not during a cold boot
 *
 * Observed directly on an iPhone: tapping a Pokemon restock alert opened /view
 * with no filter applied, because the destination never reached the app.
 *
 * So sw.js PARKS the destination in the Cache API before doing anything else,
 * and this hook collects it when the app is ready — on mount, and again whenever
 * the page becomes visible. The postMessage path is kept as a fast path for an
 * app that is already running, but nothing depends on it any more.
 *
 * ── Why the Cache API ────────────────────────────────────────────────────────
 * It is reachable from both the worker and the page, and it survives the worker
 * being killed and restarted between the tap and the app finishing its boot —
 * which iOS is free to do, and which would discard any in-memory value.
 */

/** Duplicated in public/sw.js, which cannot import from src/. Keep in step. */
const NAV_CACHE = 'packradar-pending-nav'
const NAV_KEY = '/__packradar_pending_nav'

/**
 * How long a parked destination stays valid.
 *
 * Without an expiry, a notification tapped but never followed through (the app
 * fails to launch, the phone is locked again immediately) would leave a target
 * that applies itself to some unrelated launch hours later — the user opens the
 * app by hand and it mysteriously filters to Pokemon. Two minutes is far longer
 * than any real tap-to-boot and far shorter than a session gap.
 */
const PENDING_NAV_TTL_MS = 2 * 60 * 1000

/** Read and CONSUME the parked destination. Consuming is what stops it reapplying. */
async function consumePendingNav(): Promise<string | null> {
  if (typeof caches === 'undefined') return null
  try {
    const cache = await caches.open(NAV_CACHE)
    const hit = await cache.match(NAV_KEY)
    if (!hit) return null
    // Delete before parsing: a malformed entry must not be able to wedge itself
    // in place and be retried on every visibility change.
    await cache.delete(NAV_KEY)

    const { url, at } = (await hit.json()) as { url?: unknown; at?: unknown }
    if (typeof url !== 'string' || !url.startsWith('/')) return null
    if (typeof at !== 'number' || Date.now() - at > PENDING_NAV_TTL_MS) return null
    return url
  } catch {
    return null
  }
}

export function usePushNavigation() {
  const navigate = useNavigate()

  const applyPending = useCallback(async () => {
    const url = await consumePendingNav()
    if (url) navigate(url)
  }, [navigate])

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Cold start: the app may have been launched by a tap whose URL iOS dropped.
    void applyPending()

    // Resume: an already-running app that was focused by a tap. visibilitychange
    // is what fires when iOS brings a standalone app back to the foreground.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void applyPending()
    }
    document.addEventListener('visibilitychange', onVisible)

    // Fast path for a running app, so it does not wait on visibilitychange.
    const onMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || data.type !== 'packradar:navigate') return
      /* Same-origin paths only. The worker builds this from a push payload, and
       * a push payload is not an authenticated source. sw.js validates it too;
       * a navigation to an attacker-named destination is worth refusing twice. */
      if (typeof data.url !== 'string' || !data.url.startsWith('/')) return
      navigate(data.url)
    }
    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null
    sw?.addEventListener('message', onMessage)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      sw?.removeEventListener('message', onMessage)
    }
  }, [applyPending, navigate])
}
