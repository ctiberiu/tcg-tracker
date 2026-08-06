import { describe, it, expect } from 'vitest'
import { staleGraceMs, STALE_GRACE_FALLBACK_MS, STALE_GRACE_CYCLES } from './scraper.js'

/**
 * The staleness grace decides how long a product must be continuously missing
 * from its store's listing before it is marked out of stock. Too short and one
 * missed scrape is a stock-out, and the next scrape that sees the product again
 * alerts it as a restock.
 *
 * That is not hypothetical. The grace was a flat 20 minutes, chosen when every
 * store ran at 15. Migration 034 set check_interval_minutes = 30 on four Magic
 * rows for host load; 20 cannot outlast 30; the operator got repeat restock
 * emails for ~10+ Krit Magic products over ~12 hours on 2026-08-06. Nothing in
 * the code connected the two numbers, so nothing failed when they crossed.
 *
 * WHAT THIS FILE ASSERTS, and why it is not `grace > interval`: that inequality
 * is necessary and not sufficient. `interval x 2` satisfies it and is still
 * wrong, because it lands the threshold exactly on the two-miss boundary, so a
 * run arriving thirty seconds early defers detection to the third miss. The
 * property below is the behaviour the comment promises, margin included — it
 * fails on x 2, which is the point.
 */

const MIN = 60_000

/** The sweep's own test, verbatim: stale when `lastSeen <= now - grace`, i.e.
 *  when the product's age is at least the grace. */
const isSwept = (ageMinutes, intervalMinutes) => ageMinutes * MIN >= staleGraceMs(intervalMinutes)

/** Every interval worth checking, including the two configured in production
 *  (15 and 30) and values well outside them. */
const INTERVALS = [1, 2, 5, 10, 12, 15, 20, 25, 30, 45, 60, 90, 120, 240, 1440]

describe('the property: survive one miss, trip on the second, with margin', () => {
  it.each(INTERVALS)('a product missing for ONE %i-minute cycle is not swept', (interval) => {
    expect(isSwept(interval, interval)).toBe(false)
  })

  it.each(INTERVALS)('a product missing for TWO %i-minute cycles is swept', (interval) => {
    expect(isSwept(interval * 2, interval)).toBe(true)
  })

  // The half that x 2 fails. Without margin, detection is a coin flip on
  // scheduler jitter: the same store trips on the second miss one day and the
  // third the next, and the difference is unreproducible.
  it.each(INTERVALS)('holds with slack on both sides at %i minutes', (interval) => {
    const grace = staleGraceMs(interval) / MIN
    // Room before the one-miss mark, and room after the two-miss mark.
    expect(grace - interval).toBeGreaterThan(0)
    expect(interval * 2 - grace).toBeGreaterThan(0)
  })

  // Same property, expressed as the jitter it has to tolerate: a run landing
  // early or late by a fifth of a cycle must not change which miss trips.
  it.each(INTERVALS)('survives +/-20%% scheduler jitter at %i minutes', (interval) => {
    expect(isSwept(interval * 1.2, interval)).toBe(false)
    expect(isSwept(interval * 1.8, interval)).toBe(true)
  })
})

describe('staleGraceMs', () => {
  it('sits between one and two cycles', () => {
    expect(STALE_GRACE_CYCLES).toBeGreaterThan(1)
    expect(STALE_GRACE_CYCLES).toBeLessThan(2)
  })

  it('derives from the interval', () => {
    expect(staleGraceMs(30)).toBe(30 * STALE_GRACE_CYCLES * MIN)
    expect(staleGraceMs(15)).toBe(22.5 * MIN)
  })

  // The four Magic rows this bug was reported on.
  it('gives a 30-minute store a grace longer than one cycle', () => {
    expect(staleGraceMs(30) / MIN).toBe(45)
    expect(isSwept(30, 30)).toBe(false)
    expect(isSwept(60, 30)).toBe(true)
  })

  // 70 of the 74 enabled stores. 20 -> 22.5 is a rounding difference, not a
  // behaviour change: detection still lands on the second miss.
  it('barely moves the 15-minute majority', () => {
    expect(staleGraceMs(15) / MIN).toBe(22.5)
    expect(isSwept(15, 15)).toBe(false)
    expect(isSwept(30, 15)).toBe(true)
  })

  // NO FLOOR on the derived value. A 20-minute floor would break the property
  // below ~13 minutes: at 10 the two-miss mark lands exactly on the threshold,
  // and at 5 a product survives two misses entirely and trips on the fourth.
  // That is the same defect class as the bug being fixed, so the floor is gone
  // and this asserts it stays gone.
  it('does not floor a short interval into a broken grace', () => {
    expect(staleGraceMs(5) / MIN).toBe(7.5)
    expect(staleGraceMs(10) / MIN).toBe(15)
    expect(isSwept(10, 5)).toBe(true)
    expect(isSwept(20, 10)).toBe(true)
  })

  // An unreadable interval must not disable the grace. Returning 0 here would
  // sweep every missing product on its first miss across all 74 stores —
  // strictly worse than the bug being fixed.
  it.each([null, undefined, 0, -30, NaN, Infinity, 'thirty', ''])(
    'falls back for %p rather than returning no grace',
    (bad) => {
      expect(staleGraceMs(bad)).toBe(STALE_GRACE_FALLBACK_MS)
    },
  )

  it('accepts a numeric string, since the column arrives over JSON', () => {
    expect(staleGraceMs('30')).toBe(staleGraceMs(30))
  })
})

describe('the configuration this has to survive', () => {
  // The live board on 2026-08-06: 70 stores at 15 minutes, 4 at 30. Written as
  // data so raising an interval here is the cheap way to check a schedule
  // change before it ships, rather than after the emails arrive.
  const CONFIGURED_INTERVALS = [15, 30]

  it.each(CONFIGURED_INTERVALS)('holds the property at the configured %i minutes', (interval) => {
    expect(isSwept(interval, interval)).toBe(false)
    expect(isSwept(interval * 2, interval)).toBe(true)
  })
})
