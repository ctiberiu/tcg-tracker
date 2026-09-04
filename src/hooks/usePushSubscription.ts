import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { GameKey } from '../components/packradar/tokens'
import {
  SUBSCRIBABLE_GAMES,
  readPushEnvironment,
  resolvePushCapability,
  serialiseSubscription,
  urlBase64ToUint8Array,
  type PushCapability,
} from '../lib/push'

/**
 * The VAPID public key, which identifies this server to the push service.
 *
 * Deliberately NOT validated at module load the way supabase.ts validates its
 * env vars. That file throws because the app cannot function without Supabase;
 * push is an optional enhancement, and throwing here would take the whole site
 * down on any deploy that forgot the variable. Missing key degrades to
 * `unsupported`, which shows no prompt — the same as an unsupported browser.
 */
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

const SERVICE_WORKER_URL = '/sw.js'

export interface PushState {
  capability: PushCapability | null
  /** A live subscription exists on THIS device. */
  subscribed: boolean
  games: GameKey[]
  busy: boolean
  error: string | null
}

export function usePushSubscription() {
  const [state, setState] = useState<PushState>({
    capability: null,
    subscribed: false,
    games: SUBSCRIBABLE_GAMES,
    busy: false,
    error: null,
  })

  /**
   * Resolve capability and look for an existing subscription.
   *
   * Runs on mount so a returning visitor sees their real state rather than a
   * fresh "turn on notifications" prompt they already answered. The service
   * worker is registered here too, but ONLY when push is actually usable — on an
   * iOS Safari tab PushManager is absent, so nothing is registered until the
   * user installs the app and opens it from the Home Screen.
   */
  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return

    const capability = resolvePushCapability(readPushEnvironment())
    if (!VAPID_PUBLIC_KEY) {
      // No key configured: the subscribe call would fail with an opaque error,
      // so present the device as unsupported and prompt for nothing.
      setState((s) => ({ ...s, capability: { state: 'unsupported' } }))
      return
    }

    if (capability.state !== 'ready' && capability.state !== 'granted') {
      setState((s) => ({ ...s, capability, subscribed: false }))
      return
    }

    try {
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL)

      // Force an update check on every launch.
      //
      // register() with an unchanged script URL does not reliably re-fetch on
      // iOS, and an installed standalone app can keep an old worker alive across
      // launches — so a deployed sw.js fix can sit unused on the device
      // indefinitely while everything looks correctly shipped from the server
      // side. That is exactly how two notification-tap fixes appeared to fail.
      // skipWaiting()/clients.claim() in sw.js then hand over immediately once a
      // new version is actually fetched.
      void registration.update().catch(() => {})

      const existing = await registration.pushManager.getSubscription()
      if (!existing) {
        setState((s) => ({ ...s, capability, subscribed: false }))
        return
      }

      // Read this device's own selection back so the picker shows real
      // checkboxes. Keyed on the endpoint, which is the only handle the client
      // has — migration 040 exposes no way to list or search subscriptions.
      const { data } = await supabase.rpc('get_push_subscription_games', {
        p_endpoint: existing.endpoint,
      })

      // A subscription the browser still holds but the database has forgotten
      // (row pruned after repeated delivery failures, or the table was reset).
      // Treat it as not subscribed: the device would otherwise show "on" and
      // never receive anything, which is the one state with no path out.
      const games = Array.isArray(data) && data.length > 0 ? (data as GameKey[]) : null
      setState((s) => ({
        ...s,
        capability,
        subscribed: games !== null,
        games: games ?? SUBSCRIBABLE_GAMES,
      }))
    } catch (err) {
      setState((s) => ({
        ...s,
        capability,
        error: err instanceof Error ? err.message : 'Push check failed',
      }))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * Subscribe this device.
   *
   * ── MUST be called directly from a click handler ─────────────────────────
   * Notification.requestPermission() is gated on a user gesture, and Safari
   * drops the gesture across an await. Registering the service worker first —
   * the intuitive order, since the registration is what subscribes — makes the
   * permission call reject silently on iOS with no dialog shown. So permission
   * is requested FIRST, before anything async, and the registration happens
   * afterwards. Do not reorder these.
   */
  const enable = useCallback(
    async (games: GameKey[] = SUBSCRIBABLE_GAMES): Promise<boolean> => {
      setState((s) => ({ ...s, busy: true, error: null }))
      try {
        // Ask before awaiting anything. See above.
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          setState((s) => ({
            ...s,
            busy: false,
            capability: { state: permission === 'denied' ? 'denied' : 'ready' },
          }))
          return false
        }

        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL)
        // Subscribing against a worker that is still installing throws on some
        // iOS builds; `ready` is the documented point at which it is safe.
        await navigator.serviceWorker.ready

        // Reuse an existing subscription if the browser already has one for this
        // key. Calling subscribe() twice with different keys throws, and the
        // permission-granted path is reachable with a subscription already live.
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            // Required to be true, and enforced by the browser: web push may not
            // be silent. That aligns with the sw.js rule that every push shows a
            // notification.
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          }))

        const payload = serialiseSubscription(subscription)
        if (!payload) throw new Error('Subscription is missing its encryption keys')

        const { error } = await supabase.rpc('upsert_push_subscription', {
          p_endpoint: payload.endpoint,
          p_p256dh: payload.p256dh,
          p_auth: payload.auth,
          p_games: games,
          p_user_agent: navigator.userAgent,
        })
        if (error) throw new Error(error.message)

        setState((s) => ({
          ...s,
          busy: false,
          subscribed: true,
          games,
          capability: { state: 'granted' },
        }))
        return true
      } catch (err) {
        setState((s) => ({
          ...s,
          busy: false,
          error: err instanceof Error ? err.message : 'Could not enable notifications',
        }))
        return false
      }
    },
    [],
  )

  /**
   * Unsubscribe this device.
   *
   * The database row is deleted BEFORE the browser subscription, because the
   * reverse order strands rows: once unsubscribe() succeeds the endpoint is gone
   * from the client and nothing can ever name that row again. It would then sit
   * in the table until a send failed against it.
   */
  const disable = useCallback(async (): Promise<boolean> => {
    setState((s) => ({ ...s, busy: true, error: null }))
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        const { error } = await supabase.rpc('delete_push_subscription', {
          p_endpoint: subscription.endpoint,
        })
        if (error) throw new Error(error.message)
        await subscription.unsubscribe()
      }

      setState((s) => ({ ...s, busy: false, subscribed: false }))
      return true
    } catch (err) {
      setState((s) => ({
        ...s,
        busy: false,
        error: err instanceof Error ? err.message : 'Could not turn off notifications',
      }))
      return false
    }
  }, [])

  /**
   * Change which games this device wants.
   *
   * An empty selection is an UNSUBSCRIBE, not an update: migration 040 cannot
   * store a zero-length array precisely so that "subscribed to nothing" is
   * unrepresentable. Routing it here keeps that decision in one place.
   */
  const updateGames = useCallback(
    async (games: GameKey[]): Promise<boolean> => {
      if (games.length === 0) return disable()
      setState((s) => ({ ...s, busy: true, error: null }))
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (!subscription) throw new Error('This device is not subscribed')

        const payload = serialiseSubscription(subscription)
        if (!payload) throw new Error('Subscription is missing its encryption keys')

        const { error } = await supabase.rpc('upsert_push_subscription', {
          p_endpoint: payload.endpoint,
          p_p256dh: payload.p256dh,
          p_auth: payload.auth,
          p_games: games,
          p_user_agent: navigator.userAgent,
        })
        if (error) throw new Error(error.message)

        setState((s) => ({ ...s, busy: false, games }))
        return true
      } catch (err) {
        setState((s) => ({
          ...s,
          busy: false,
          error: err instanceof Error ? err.message : 'Could not update games',
        }))
        return false
      }
    },
    [disable],
  )

  return { ...state, enable, disable, updateGames, refresh }
}
