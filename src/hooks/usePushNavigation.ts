import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Routes a notification tap to the right page when the app is ALREADY OPEN.
 *
 * ── Why the service worker cannot just do this itself ────────────────────────
 * The obvious implementation is `client.navigate(url)` inside notificationclick,
 * and it is the one that fails on the target platform: in an iOS standalone web
 * app that call is unsupported on several versions and rejects rather than
 * navigating. It also performs a full document load, discarding the scroll
 * position and state of an app the user already had open.
 *
 * So sw.js posts the destination instead and this hook performs the navigation
 * through React Router. That keeps it a client-side route change — instant, and
 * working in standalone mode.
 *
 * ── The three launch cases, and which one this covers ────────────────────────
 *   app closed, tapped notification  -> openWindow(url), the URL carries the
 *                                       filter, this hook is not involved
 *   app backgrounded, resumed by the user, no notification
 *                                    -> nothing happens here, and nothing
 *                                       should: the page was never unloaded, so
 *                                       whatever filters they had are still set
 *   app backgrounded, tapped notification
 *                                    -> THIS. The window exists, so no new URL
 *                                       is loaded and the filter would never
 *                                       apply without a message.
 *
 * Mounted once from PushPrompt, which is itself rendered once inside the router.
 */
export function usePushNavigation() {
  const navigate = useNavigate()

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const onMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || data.type !== 'packradar:navigate') return

      /* Same-origin paths only. Messages arrive from the service worker, which
       * builds this from a push payload — and a push payload is not an
       * authenticated source. sw.js already validates it; this is the second
       * check, because a navigate() to an attacker-named destination is worth
       * refusing twice. */
      if (typeof data.url !== 'string' || !data.url.startsWith('/')) return

      navigate(data.url)
    }

    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])
}
