import { useEffect, useRef } from 'react'

/**
 * Reloads the app when a newer build is deployed.
 *
 * ── The problem this solves ──────────────────────────────────────────────────
 * An installed iOS web app is not a browser tab. iOS SUSPENDS and RESTORES it
 * rather than reloading, so a phone keeps executing whatever bundle it was
 * launched with — potentially for days, across any number of deploys. There is
 * no navigation to trigger a re-fetch and no reload button for the user to
 * press. A fix can be deployed, verified live on the server, and still never run
 * on the device.
 *
 * That is not hypothetical here: two fixes to the notification-tap path were
 * shipped and both appeared to fail on a real iPhone, with the most likely
 * explanation being that the phone was still running the bundle it was installed
 * with — one that did not contain either fix.
 *
 * Registering a service worker does not solve this. A worker update replaces the
 * WORKER; the already-loaded page keeps its old JavaScript either way.
 *
 * ── Why it reloads on resume, and only on resume ─────────────────────────────
 * The check runs when the app returns to the foreground, never mid-session. A
 * reload during use would throw away scroll position, filters and any half-typed
 * search — for a fix the user did not ask for and cannot see. Coming back to a
 * backgrounded app is the one moment where a reload is invisible, because the
 * app is already re-presenting itself.
 *
 * A version change also cannot be acted on by prompting: this is a restock
 * tracker people open for a few seconds, and an update dialog would be pure
 * friction for a decision they have no basis to make.
 */

/** Written at build time by versionPlugin in vite.config.ts. */
const VERSION_URL = '/version.json'

/**
 * Ignore checks closer together than this. visibilitychange can fire repeatedly
 * while iOS settles an app back into the foreground, and each one would
 * otherwise be a network request.
 */
const MIN_CHECK_INTERVAL_MS = 30_000

async function fetchVersion(): Promise<string | null> {
  try {
    // no-store, not no-cache: this file exists to report reality, and a cached
    // copy would report the version the app already has — the exact failure this
    // hook exists to detect.
    const res = await fetch(VERSION_URL, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: unknown }
    return typeof data.version === 'string' ? data.version : null
  } catch {
    // Offline, or the deploy is mid-flight. Staying on the current version is
    // always the safe answer; the next resume tries again.
    return null
  }
}

export function useAppVersion() {
  /**
   * The version this session booted with, read once and never updated.
   *
   * Deliberately NOT seeded from a build-time constant compiled into the bundle:
   * the question is "does the server now serve something different from what I
   * am running", and the honest way to answer it is to record what the server
   * said at boot and compare against what it says later.
   */
  const booted = useRef<string | null>(null)
  const lastCheck = useRef(0)

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      const now = Date.now()
      if (now - lastCheck.current < MIN_CHECK_INTERVAL_MS) return
      lastCheck.current = now

      const version = await fetchVersion()
      if (cancelled || !version) return

      if (booted.current === null) {
        booted.current = version
        return
      }
      if (version !== booted.current) {
        // Nothing to clean up: the page is about to be replaced wholesale, and
        // the service worker's own skipWaiting/clients.claim handles its side.
        window.location.reload()
      }
    }

    void check()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    // pageshow with persisted=true is the bfcache restore, which
    // visibilitychange does not always cover on iOS.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void check()
    }
    window.addEventListener('pageshow', onPageShow)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])
}
