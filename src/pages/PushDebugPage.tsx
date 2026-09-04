import { useCallback, useEffect, useState } from 'react'
import { readPushEnvironment, resolvePushCapability } from '../lib/push'

/**
 * On-device diagnostics for the notification-tap path.
 *
 * ── Why this page exists ─────────────────────────────────────────────────────
 * The tapped-notification filter failed twice on a real iPhone and both fixes
 * were reasoned out blind — there is no console on an installed iOS web app, so
 * every question that mattered was being answered by inference:
 *
 *   is the phone running the worker I deployed, or an old one it kept?
 *   did notificationclick fire at all?
 *   was the app open (postMessage path) or closed (openWindow path)?
 *   did the destination get parked, and did the page ever read it?
 *
 * Each of those is a different bug with a different fix, and guessing between
 * them costs a deploy and a round trip every time. sw.js records a version stamp
 * and a breadcrumb per step; this page reads them back.
 *
 * Deliberately unlinked from the UI and disallowed in robots.txt. It is a
 * workshop tool, not a feature, and it exposes nothing sensitive — the endpoint
 * is shown truncated.
 */

const NAV_CACHE = 'packradar-pending-nav'
const INFO_KEY = '/__packradar_sw_info'
const TRACE_KEY = '/__packradar_sw_trace'
const NAV_KEY = '/__packradar_pending_nav'

interface Snapshot {
  swVersion: string | null
  swActivatedAt: number | null
  scriptUrl: string | null
  registrationState: string
  trace: { at: number; step: string; detail: unknown; version?: string }[]
  pendingNav: string | null
  permission: string
  standalone: boolean
  capability: string
  endpointTail: string | null
  href: string
  /** Bundle this page is EXECUTING, read from the document's own script tag. */
  runningBundle: string | null
  /** Bundle the server is serving right now, from /version.json. */
  serverBundle: string | null
}

async function readCache<T>(key: string): Promise<T | null> {
  if (typeof caches === 'undefined') return null
  try {
    const cache = await caches.open(NAV_CACHE)
    const hit = await cache.match(key)
    return hit ? ((await hit.json()) as T) : null
  } catch {
    return null
  }
}

export function PushDebugPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null)

  const refresh = useCallback(async () => {
    const env = readPushEnvironment()
    const info = await readCache<{ version: string; activatedAt: number }>(INFO_KEY)
    const trace = (await readCache<Snapshot['trace']>(TRACE_KEY)) ?? []
    // Read WITHOUT consuming — usePushNavigation owns consumption, and a debug
    // view that ate the value would change the behaviour it is meant to observe.
    const pending = await readCache<{ url: string; at: number }>(NAV_KEY)

    let scriptUrl: string | null = null
    let registrationState = 'none'
    let endpointTail: string | null = null
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) {
        registrationState = reg.active ? 'active' : reg.installing ? 'installing' : reg.waiting ? 'waiting' : 'unknown'
        scriptUrl = reg.active?.scriptURL ?? null
        const sub = await reg.pushManager.getSubscription()
        endpointTail = sub ? `…${sub.endpoint.slice(-14)}` : null
      }
    }

    // The staleness check that matters most. An installed iOS app is restored
    // from memory rather than reloaded, so these two can disagree for days —
    // which makes a deployed fix invisible on the device.
    const runningBundle =
      [...document.querySelectorAll('script[src]')]
        .map((el) => (el as HTMLScriptElement).src)
        .find((src) => src.includes('/assets/index-'))
        ?.split('/')
        .slice(-1)[0] ?? null
    let serverBundle: string | null = null
    try {
      const res = await fetch('/version.json', { cache: 'no-store' })
      const v = (await res.json()) as { version?: string }
      serverBundle = v.version?.split('/').slice(-1)[0] ?? null
    } catch { /* offline */ }

    setSnap({
      runningBundle,
      serverBundle,
      swVersion: info?.version ?? null,
      swActivatedAt: info?.activatedAt ?? null,
      scriptUrl,
      registrationState,
      trace,
      pendingNav: pending ? `${pending.url}  (${Math.round((Date.now() - pending.at) / 1000)}s ago)` : null,
      permission: env.permission,
      standalone: env.standalone,
      capability: resolvePushCapability(env).state,
      endpointTail,
      href: window.location.href,
    })
  }, [])

  useEffect(() => {
    // Reading the Cache API, which is an external system the page does not
    // otherwise observe — the case this rule's own guidance carves out. There is
    // no render-time source for a value another context wrote.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  /** Force an update check. iOS can keep an old worker alive across launches. */
  const forceUpdate = async () => {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
    await refresh()
  }

  const clearTrace = async () => {
    const cache = await caches.open(NAV_CACHE)
    await cache.delete(TRACE_KEY)
    await refresh()
  }

  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--pr-border)' }}>
      <span style={{ color: 'var(--pr-text-dim)', fontSize: 11, minWidth: 116, flex: 'none' }}>{k}</span>
      <span style={{ color: 'var(--pr-text-bright)', fontSize: 12, wordBreak: 'break-all', fontFamily: 'var(--pr-font-mono)' }}>
        {v ?? '—'}
      </span>
    </div>
  )

  return (
    <div style={{ padding: '20px 16px 60px', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--pr-font-display)', fontSize: 20, color: 'var(--pr-text-bright)', marginBottom: 4 }}>
        Push diagnostics
      </h1>
      <p style={{ color: 'var(--pr-text-dim)', fontSize: 12, marginBottom: 18 }}>
        Tap a notification, then come back here and press Refresh.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {[
          { label: 'Refresh', fn: refresh },
          { label: 'Force SW update', fn: forceUpdate },
          { label: 'Clear trace', fn: clearTrace },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={() => void b.fn()}
            style={{
              minHeight: 40, padding: '0 14px', background: 'transparent',
              border: '1px solid var(--pr-border)', color: 'var(--pr-text-mid)',
              fontFamily: 'var(--pr-font-mono)', fontSize: 11, letterSpacing: 1,
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            {b.label}
          </button>
        ))}
      </div>

      {!snap ? (
        <p style={{ color: 'var(--pr-text-dim)', fontSize: 13 }}>Reading…</p>
      ) : (
        <>
          {row(
            'app bundle',
            snap.runningBundle === null || snap.serverBundle === null ? (
              `${snap.runningBundle ?? '?'} / server ${snap.serverBundle ?? '?'}`
            ) : snap.runningBundle === snap.serverBundle ? (
              <span style={{ color: 'var(--pr-signal)' }}>up to date ({snap.runningBundle})</span>
            ) : (
              <span style={{ color: 'var(--pr-status-gone)' }}>
                STALE — running {snap.runningBundle}, server has {snap.serverBundle}
              </span>
            ),
          )}
          {row('SW version', snap.swVersion ?? 'NOT RECORDED — old worker still active')}
          {row('SW state', snap.registrationState)}
          {row('SW script', snap.scriptUrl)}
          {row('activated', snap.swActivatedAt ? new Date(snap.swActivatedAt).toISOString().slice(11, 19) : null)}
          {row('permission', snap.permission)}
          {row('standalone', String(snap.standalone))}
          {row('capability', snap.capability)}
          {row('subscription', snap.endpointTail)}
          {row('pending nav', snap.pendingNav ?? 'none')}
          {row('current url', snap.href)}

          <h2 style={{ fontFamily: 'var(--pr-font-display)', fontSize: 15, color: 'var(--pr-text-bright)', margin: '24px 0 8px' }}>
            Tap trace ({snap.trace.length})
          </h2>
          {snap.trace.length === 0 ? (
            <p style={{ color: 'var(--pr-status-gone)', fontSize: 12.5, lineHeight: 1.6 }}>
              Empty. notificationclick never ran in this worker — either the tap did not reach it, or the
              device is still on an older worker that has no tracing.
            </p>
          ) : (
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {snap.trace.map((t, i) => (
                <li key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--pr-border)', fontSize: 12, fontFamily: 'var(--pr-font-mono)' }}>
                  <span style={{ color: 'var(--pr-text-dim)' }}>{new Date(t.at).toISOString().slice(11, 19)}</span>{' '}
                  <span style={{ color: 'var(--pr-signal)' }}>{t.step}</span>{' '}
                  <span style={{ color: 'var(--pr-text-bright)' }}>{String(t.detail ?? '')}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
}
