import { useEffect, useState } from 'react'
import { SNIPE_DASHBOARD_SOURCE, isSnipeExtensionMessage } from '../lib/snipe'

/**
 * Detects the Snipe browser extension. The extension's dashboard content script
 * (Phase 1 bridge) announces itself with an `EXT_PRESENT` postMessage on load
 * and answers a `PING` with `PONG`. We listen for either and also send a PING,
 * timing out to "not installed" if nothing replies.
 */
export function useExtensionDetected(): { detected: boolean; checking: boolean } {
  const [detected, setDetected] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let settled = false

    const onMessage = (e: MessageEvent) => {
      if (e.source !== window) return
      if (isSnipeExtensionMessage(e.data)) {
        settled = true
        setDetected(true)
        setChecking(false)
      }
    }
    window.addEventListener('message', onMessage)

    const ping = () =>
      window.postMessage({ source: SNIPE_DASHBOARD_SOURCE, type: 'PING', requestId: 'detect' }, window.origin)
    ping()
    const retry = setTimeout(ping, 300)
    const timeout = setTimeout(() => {
      if (!settled) setChecking(false)
    }, 1500)

    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(retry)
      clearTimeout(timeout)
    }
  }, [])

  return { detected, checking }
}
