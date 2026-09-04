import { describe, expect, it } from 'vitest'
import {
  MIN_IOS_VERSION,
  SUBSCRIBABLE_GAMES,
  isIosDevice,
  parseIosVersion,
  resolvePushCapability,
  urlBase64ToUint8Array,
  type PushEnvironment,
} from './push'
import { GAMES } from '../components/packradar/tokens'

/**
 * These tests exist because every interesting branch in push.ts is a platform
 * this repo is not developed on. The iOS paths are the feature's whole reason
 * for existing and cannot be exercised in a dev server, a Storybook browser
 * test, or CI — only on a physical iPhone. Recorded user agents are the closest
 * thing to a regression net that runs on every commit.
 */

const UA = {
  /* iPhone, Safari tab. The single most important case: push is unavailable but
   * REACHABLE, via Add to Home Screen. */
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  /* Same device after installing. UA is identical — only `standalone` differs,
   * which is exactly why the flag cannot be inferred from the UA. */
  iphoneStandalone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  /* Below the 16.4 floor — installing would not help. */
  iphoneOld:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
  /* iPadOS 13+ masquerading as a Mac — no iOS version anywhere in the string. */
  ipadOs:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  desktopSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
}

/** A device with full push support, overridable per case. */
function env(overrides: Partial<PushEnvironment> = {}): PushEnvironment {
  return {
    userAgent: UA.androidChrome,
    maxTouchPoints: 0,
    standalone: false,
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    permission: 'default',
    ...overrides,
  }
}

/** What an iOS Safari TAB actually looks like: the APIs are absent, not denied. */
function iosTab(overrides: Partial<PushEnvironment> = {}): PushEnvironment {
  return env({
    userAgent: UA.iphoneSafari,
    maxTouchPoints: 5,
    standalone: false,
    hasServiceWorker: true,
    hasPushManager: false,
    hasNotification: false,
    permission: 'unavailable',
    ...overrides,
  })
}

describe('parseIosVersion', () => {
  it('reads major.minor from an iPhone user agent', () => {
    expect(parseIosVersion(UA.iphoneSafari)).toBe(17.4)
    expect(parseIosVersion(UA.iphoneOld)).toBe(15.7)
  })

  it('returns null for iPadOS, which publishes no iOS version', () => {
    expect(parseIosVersion(UA.ipadOs)).toBeNull()
  })

  it('returns null for non-Apple platforms', () => {
    expect(parseIosVersion(UA.androidChrome)).toBeNull()
  })

  it('does not mistake the 16.4 floor for 164', () => {
    const v = parseIosVersion('Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)')
    expect(v).toBe(16.4)
    expect(v).toBeGreaterThanOrEqual(MIN_IOS_VERSION)
  })
})

describe('isIosDevice', () => {
  it('recognises iPhone', () => {
    expect(isIosDevice(UA.iphoneSafari)).toBe(true)
  })

  it('recognises iPadOS 13+ by touch points despite the Mac user agent', () => {
    expect(isIosDevice(UA.ipadOs, 5)).toBe(true)
  })

  it('does NOT treat a real desktop Mac as iOS', () => {
    // Same user agent as the iPad above. Touch points are the only difference,
    // so getting this wrong shows iPhone install instructions on a laptop.
    expect(isIosDevice(UA.desktopSafari, 0)).toBe(false)
  })
})

describe('resolvePushCapability', () => {
  it('an iPhone Safari tab needs installing, not a permission prompt', () => {
    expect(resolvePushCapability(iosTab())).toEqual({
      state: 'ios-needs-install',
      iosVersion: 17.4,
    })
  })

  it('the same iPhone, once installed, is ready to prompt', () => {
    const installed = env({
      userAgent: UA.iphoneStandalone,
      maxTouchPoints: 5,
      standalone: true,
    })
    expect(resolvePushCapability(installed)).toEqual({ state: 'ready' })
  })

  it('an iPhone below 16.4 is told nothing can be done, not to install', () => {
    // Installing genuinely does not help here, so offering the Share-sheet
    // instructions would walk the user through five steps to reach a dead end.
    expect(resolvePushCapability(iosTab({ userAgent: UA.iphoneOld }))).toEqual({
      state: 'ios-too-old',
      iosVersion: 15.7,
    })
  })

  it('an iPad with no version string is assumed modern, not too old', () => {
    expect(resolvePushCapability(iosTab({ userAgent: UA.ipadOs }))).toEqual({
      state: 'ios-needs-install',
      iosVersion: null,
    })
  })

  it('an INSTALLED iOS app with denied permission is never told to reinstall', () => {
    // The regression this guards: `denied` must beat the iOS branch. Otherwise a
    // home-screen app that was refused permission is sent back through Add to
    // Home Screen, which it has already done and which cannot fix anything.
    const deniedInstalled = env({
      userAgent: UA.iphoneStandalone,
      maxTouchPoints: 5,
      standalone: true,
      permission: 'denied',
    })
    expect(resolvePushCapability(deniedInstalled)).toEqual({ state: 'denied' })
  })

  it('reports granted so the caller can look for a live subscription', () => {
    expect(resolvePushCapability(env({ permission: 'granted' }))).toEqual({ state: 'granted' })
  })

  it('a desktop browser without push support gets no prompt at all', () => {
    const old = env({
      userAgent: UA.desktopSafari,
      hasPushManager: false,
      hasNotification: false,
      permission: 'unavailable',
    })
    expect(resolvePushCapability(old)).toEqual({ state: 'unsupported' })
  })
})

describe('urlBase64ToUint8Array', () => {
  it('round-trips the real VAPID public key to 65 bytes', () => {
    // An uncompressed P-256 point is always 65 bytes and starts with 0x04.
    // pushManager.subscribe rejects anything else, so length is the assertion
    // that actually catches a mangled key.
    const key = 'BCphmc9oy3eCT0aVUip7cuB6JqFUHRZUq4sQq8qs7TqpWywlzm5cZtRmaKQQavkKnb1vnuGQ3Xa_MFErl3cJfj4'
    const bytes = urlBase64ToUint8Array(key)
    expect(bytes).toHaveLength(65)
    expect(bytes[0]).toBe(0x04)
  })

  it('translates the URL-safe alphabet rather than passing it through', () => {
    // '-' and '_' are not valid standard base64; atob would throw on them.
    expect(() => urlBase64ToUint8Array('a-b_cd')).not.toThrow()
  })
})

describe('SUBSCRIBABLE_GAMES', () => {
  it('matches the GAMES registry exactly', () => {
    expect(SUBSCRIBABLE_GAMES).toEqual(Object.keys(GAMES))
  })

  it('stays within migration 040s CHECK constraint', () => {
    // The DB copy of this list. Adding a game means editing both, and this
    // asserts the pair has not drifted — a game present here but absent there is
    // rejected at subscribe time as a constraint violation the user sees as
    // "enabling notifications failed".
    const allowedInDatabase = [
      'pokemon', 'magic', 'lorcana', 'yugioh', 'digimon',
      'one_piece', 'duel_masters', 'dragon_ball_super', 'weiss_schwarz', 'riftbound',
    ]
    expect([...SUBSCRIBABLE_GAMES].sort()).toEqual([...allowedInDatabase].sort())
    // cardinality(games) BETWEEN 1 AND 10 — selecting everything must be storable.
    expect(SUBSCRIBABLE_GAMES.length).toBeLessThanOrEqual(10)
  })
})
