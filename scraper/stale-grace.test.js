import { describe, it, expect } from 'vitest'
import { staleGraceMs, STALE_GRACE_FLOOR_MS, STALE_GRACE_CYCLES } from './scraper.js'

/**
 * The staleness grace decides how long a product must be continuously missing
 * from its store's listing before it is marked out of stock. If the grace is
 * shorter than the store's scrape interval, ONE missed scrape is a stock-out,
 * and the next scrape that sees the product again alerts it as a restock.
 *
 * That is not hypothetical. The grace was a flat 20 minutes, chosen when every
 * store ran at 15. Migration 034 set check_interval_minutes = 30 on four Magic
 * rows for host load; 20 cannot outlast 30; the operator got repeat restock
 * emails for ~10+ Krit Magic products over ~12 hours on 2026-08-06. Nothing in
 * the code connected the two numbers, so nothing failed when they crossed.
 *
 * This file is that connection.
 */

const minutes = (ms) => ms / 60_000

describe('staleGraceMs invariant', () => {
  // THE ASSERTION THAT WOULD HAVE CAUGHT THE BUG. Not "the grace is 20 minutes"
  // — that was true and still wrong. The property is relational: whatever the
  // interval, the grace must outlast it, or a single miss is a stock-out.
  it.each([1, 5, 10, 15, 20, 25, 30, 45, 60, 90, 120, 240, 1440])(
    'outlasts a %i-minute interval',
    (interval) => {
      expect(minutes(staleGraceMs(interval))).toBeGreaterThan(interval)
    },
  )

  it('outlasts the interval by the full cycle count once past the floor', () => {
    expect(staleGraceMs(30)).toBe(30 * STALE_GRACE_CYCLES * 60_000)
    expect(staleGraceMs(60)).toBe(60 * STALE_GRACE_CYCLES * 60_000)
  })

  // The 30-minute rows are the live case. Stated separately from the sweep
  // above so a regression names the right thing.
  it('gives the 30-minute Magic rows a grace longer than one cycle', () => {
    expect(minutes(staleGraceMs(30))).toBe(60)
    expect(minutes(staleGraceMs(30))).toBeGreaterThan(30)
  })

  // The fix must never SHORTEN a grace. It does lengthen one: the 70 stores at
  // 15 minutes go from a flat 20 to 30, because 15 x 2 clears the floor. That
  // is a deliberate behaviour change and it is asserted here so it is a
  // decision on the record rather than a side effect nobody noticed.
  //
  // Both values implement the same documented rule — flip on the SECOND
  // consecutive miss. At a 15-minute interval a product missed once was last
  // seen 15 minutes ago, which survives either grace; missed twice it is 30
  // minutes stale, which trips either. 30 just states the rule exactly instead
  // of approximating it, and gives back the margin that run-to-run jitter eats.
  it('lengthens the 15-minute majority from 20 minutes to 30, and never shortens', () => {
    expect(minutes(staleGraceMs(15))).toBe(30)
    expect(staleGraceMs(15)).toBeGreaterThanOrEqual(STALE_GRACE_FLOOR_MS)
  })

  // The floor only binds below 10 minutes, which nothing is configured at
  // today. It exists so that a store set to a very short interval does not get
  // a grace measured in single-digit minutes.
  it('never returns less than the floor', () => {
    for (const interval of [1, 2, 5, 9, 10]) {
      expect(staleGraceMs(interval)).toBe(STALE_GRACE_FLOOR_MS)
    }
  })

  // An unreadable interval must not disable the grace. Returning 0 here would
  // mark every missing product stale on the first miss, across every store —
  // strictly worse than the bug being fixed.
  it.each([null, undefined, 0, -30, NaN, Infinity, 'thirty', ''])(
    'falls back to the floor for %p rather than to no grace',
    (bad) => {
      expect(staleGraceMs(bad)).toBe(STALE_GRACE_FLOOR_MS)
    },
  )

  it('accepts a numeric string, since the column arrives over JSON', () => {
    expect(staleGraceMs('30')).toBe(staleGraceMs(30))
  })
})

describe('the configuration this has to survive', () => {
  // Mirrors the live board on 2026-08-06: 70 stores at 15 minutes, 4 at 30.
  // Written as data so raising an interval here is the cheap way to check a
  // schedule change before it ships, rather than after the emails arrive.
  const CONFIGURED_INTERVALS = [15, 30]

  it('holds the invariant for every interval configured in production', () => {
    for (const interval of CONFIGURED_INTERVALS) {
      expect(minutes(staleGraceMs(interval))).toBeGreaterThan(interval)
    }
  })

  // The floor is only safe while it exceeds the shortest configured interval.
  // If someone sets a store to 25 minutes, the floor stops being enough and the
  // per-interval derivation is what saves it — this asserts the derivation is
  // doing that work rather than the floor coincidentally covering everything.
  it('does not rely on the floor alone', () => {
    const beyondFloor = CONFIGURED_INTERVALS.filter((i) => i * 60_000 >= STALE_GRACE_FLOOR_MS)
    for (const interval of beyondFloor) {
      expect(staleGraceMs(interval)).toBeGreaterThan(STALE_GRACE_FLOOR_MS)
    }
  })
})
