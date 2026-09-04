import type { GameKey } from '../components/packradar/tokens'
import { GAMES } from '../components/packradar/tokens'

/**
 * Web Push capability detection.
 *
 * ── Why this is a pure module with an injected environment ───────────────────
 * Every branch here is a platform this machine cannot be. The iOS paths are the
 * whole point of the feature and they are the ones a desktop dev box can never
 * exercise, so the logic is separated from `window` and unit-tested against
 * recorded user-agent strings (push.node.test.ts). Reading globals inline would
 * make the iOS branches verifiable only on an iPhone, which is exactly the code
 * that then ships wrong.
 *
 * ── Why feature detection alone is not enough ────────────────────────────────
 * `'PushManager' in window` correctly answers "can I subscribe?" but not "why
 * not?", and on iOS the why is the entire user experience. In a normal iOS
 * Safari tab PushManager is simply absent — indistinguishable, by feature
 * detection, from an ancient desktop browser that will never support push. One
 * of those users needs step-by-step Add to Home Screen instructions; the other
 * must be shown nothing at all. Telling them apart requires the user agent.
 */

/**
 * iOS shipped Web Push in 16.4, and ONLY for web apps added to the Home Screen.
 * Safari tabs have never been able to receive push and, as of this writing, still
 * cannot. There is no API to request installation — the user must go through the
 * Share sheet by hand — which is why `ios-needs-install` is an instruction screen
 * rather than a button that does the work.
 */
export const MIN_IOS_VERSION = 16.4

export interface PushEnvironment {
  userAgent: string
  /**
   * Required to recognise iPadOS 13+, which reports a desktop-Mac user agent and
   * is otherwise indistinguishable from a real Mac. See isIosDevice().
   */
  maxTouchPoints: number
  /** iOS home-screen app, or any browser reporting display-mode: standalone. */
  standalone: boolean
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  /** 'unavailable' when the Notification API itself is missing (iOS Safari tab). */
  permission: NotificationPermission | 'unavailable'
}

export type PushCapability =
  /** Can subscribe right now. The only state where a permission prompt is legal. */
  | { state: 'ready' }
  /** Already granted — the caller still has to check for a live subscription. */
  | { state: 'granted' }
  /** Permission refused. Unrecoverable from JS; needs OS settings. */
  | { state: 'denied' }
  /** iPhone/iPad in a Safari tab. Push works, but only after Add to Home Screen. */
  | { state: 'ios-needs-install'; iosVersion: number | null }
  /** iPhone/iPad below 16.4. Installing would not help; there is nothing to offer. */
  | { state: 'ios-too-old'; iosVersion: number }
  /** No push support and no path to it. Show nothing. */
  | { state: 'unsupported' }

/**
 * Parse the iOS major.minor out of a user agent, e.g. "CPU iPhone OS 17_4 like…"
 * -> 17.4. Returns null when the string carries no version.
 *
 * iPadOS 13+ is the null case that matters: it identifies as "Macintosh" and
 * publishes NO iOS version at all. That is why callers must treat null as
 * "unknown, assume modern" rather than "too old" — refusing a current iPad
 * because it declines to say which iPad it is would be the worse error.
 */
export function parseIosVersion(userAgent: string): number | null {
  const match = /(?:iPhone |CPU )?OS (\d+)[_.](\d+)/.exec(userAgent)
  if (!match) return null
  return Number.parseFloat(`${match[1]}.${match[2]}`)
}

/**
 * Is this an iPhone or iPad?
 *
 * The second clause catches iPadOS 13+, which deliberately masquerades as a Mac
 * — same UA as desktop Safari, distinguishable only by the touch points. Without
 * it, every iPad falls through to `unsupported` and is shown nothing, silently
 * excluding a whole device class from the feature.
 */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1
}

/**
 * Resolve what this device can do, and therefore which prompt (if any) to show.
 *
 * Order is deliberate. `denied` is checked before the iOS install branch because
 * a home-screen app whose permission was refused must NOT be told to install
 * itself again — it already is installed, and re-running the instructions would
 * loop the user through the Share sheet to no effect.
 */
export function resolvePushCapability(env: PushEnvironment): PushCapability {
  const ios = isIosDevice(env.userAgent, env.maxTouchPoints)
  const iosVersion = parseIosVersion(env.userAgent)

  // Below 16.4 there is no web push on iOS at all, installed or not.
  if (ios && iosVersion !== null && iosVersion < MIN_IOS_VERSION) {
    return { state: 'ios-too-old', iosVersion }
  }

  // Full support present: the ordinary path, and the only one that may prompt.
  if (env.hasServiceWorker && env.hasPushManager && env.hasNotification) {
    if (env.permission === 'granted') return { state: 'granted' }
    if (env.permission === 'denied') return { state: 'denied' }
    return { state: 'ready' }
  }

  // Support absent. On iOS that is the expected state for a Safari TAB and is
  // fixable by the user; everywhere else it is terminal.
  if (ios && !env.standalone) return { state: 'ios-needs-install', iosVersion }

  return { state: 'unsupported' }
}

/** Read the live environment. The only function here that touches globals. */
export function readPushEnvironment(): PushEnvironment {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone:
      nav.standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches === true,
    hasServiceWorker: 'serviceWorker' in nav,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : 'unavailable',
  }
}

/**
 * VAPID public keys are distributed as URL-safe base64 but
 * `pushManager.subscribe` demands raw bytes. Passing the string straight through
 * fails with an opaque InvalidCharacterError, so the conversion is explicit.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  // Backed by an explicit ArrayBuffer rather than `new Uint8Array(length)`.
  // The latter is typed Uint8Array<ArrayBufferLike>, which TS will not accept as
  // the BufferSource that applicationServerKey requires, because ArrayBufferLike
  // admits SharedArrayBuffer.
  const buffer = new ArrayBuffer(raw.length)
  const output = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

/**
 * The games a device can subscribe to.
 *
 * Derived from GAMES so this list can never drift from the badges, colours and
 * filters — the same single-source rule gamePages.ts documents. Note that the DB
 * enforces its own copy in migration 040's CHECK; those two lists are the pair
 * to keep in step when a game is added.
 */
export const SUBSCRIBABLE_GAMES = Object.keys(GAMES) as GameKey[]

/**
 * Serialise a browser PushSubscription into the four values migration 040's
 * upsert function takes.
 *
 * getKey() returns ArrayBuffers, which do not survive JSON. Both keys are
 * REQUIRED for payload encryption — a subscription missing either would be
 * stored, look healthy, and silently fail to deliver every message, so this
 * returns null rather than persisting a half-formed row.
 */
export function serialiseSubscription(
  sub: PushSubscription,
): { endpoint: string; p256dh: string; auth: string } | null {
  const p256dh = sub.getKey?.('p256dh')
  const auth = sub.getKey?.('auth')
  if (!p256dh || !auth) return null
  const encode = (buf: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return { endpoint: sub.endpoint, p256dh: encode(p256dh), auth: encode(auth) }
}
