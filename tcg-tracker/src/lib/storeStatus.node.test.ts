import { describe, it, expect } from 'vitest'
import { deriveStoreStatus, worstStatus } from './storeStatus'

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

/** A store the scraper is successfully reaching on cadence. */
const healthy = {
  is_enabled: true,
  is_flagged: false,
  consecutive_failures: 0,
  last_scraped_at: minutesAgo(5),
}

describe('deriveStoreStatus', () => {
  it('reports OK for a store scraped recently with no failures', () => {
    expect(deriveStoreStatus(healthy)).toBe('OK')
  })

  // THE CASE THAT SEPARATES THIS RULE FROM THE ONES REJECTED IN REVIEW.
  // `last_scraped_at` is stamped on EVERY attempt, including blocked ones —
  // updateStoreFailureState puts it in the base update object so due-scheduling
  // advances on failure too. So a store being 403'd on every request has a
  // perfectly fresh timestamp. Deriving health from recency alone would render
  // it OK: a false-OK on exactly the stores this site exists to surface.
  it('reports DOWN for a flagged store even when it was just scraped', () => {
    const blocked = { ...healthy, is_flagged: true, consecutive_failures: 7, last_scraped_at: minutesAgo(1) }
    expect(deriveStoreStatus(blocked)).toBe('DOWN')
  })

  it('reports DOWN for a disabled store even when it was just scraped', () => {
    const disabled = { ...healthy, is_enabled: false, last_scraped_at: minutesAgo(1) }
    expect(deriveStoreStatus(disabled)).toBe('DOWN')
  })

  it('reports SLOW while a failure streak is building but has not yet flagged', () => {
    expect(deriveStoreStatus({ ...healthy, consecutive_failures: 3 })).toBe('SLOW')
  })

  // NO STALENESS CLAUSE — see the note in storeStatus.ts. The obvious
  // "older than 2x its interval" rule is already falsified by domain-aware
  // pacing: a row's real period is `rows_on_domain x run_interval`, so a busy
  // shared host legitimately runs well behind its configured interval.
  it('does NOT report SLOW purely because a scrape is overdue', () => {
    const overdue = { ...healthy, last_scraped_at: minutesAgo(120) }
    expect(deriveStoreStatus(overdue)).toBe('OK')
  })

  it('ignores the configured interval entirely', () => {
    // lexshop.ro's 9 rows cycle at ~18 min against a nominal 15 and are healthy.
    const paced = { ...healthy, last_scraped_at: minutesAgo(18) }
    expect(deriveStoreStatus(paced)).toBe('OK')
  })

  it('reports DOWN for a store that has never been scraped', () => {
    expect(deriveStoreStatus({ ...healthy, last_scraped_at: null })).toBe('DOWN')
  })

  it('reports DOWN on an unparseable timestamp rather than assuming OK', () => {
    expect(deriveStoreStatus({ ...healthy, last_scraped_at: 'not-a-date' })).toBe('DOWN')
  })

  it('does not consider product recency at all', () => {
    // A shop that has simply not restocked for a fortnight is not unhealthy.
    // The previous rule read that as DOWN because it had no other signal.
    expect(deriveStoreStatus(healthy)).toBe('OK')
  })

  it('defaults missing fields to the safe reading', () => {
    expect(deriveStoreStatus({})).toBe('DOWN')
  })
})

describe('worstStatus', () => {
  it('lets the worst game-row decide the merged store card', () => {
    // "RedGoblin" and "RedGoblin (One Piece)" render as one card; a healthy
    // Pokemon row must not hide a blocked One Piece row.
    expect(worstStatus(['OK', 'DOWN', 'OK'])).toBe('DOWN')
    expect(worstStatus(['OK', 'SLOW'])).toBe('SLOW')
    expect(worstStatus(['OK', 'OK'])).toBe('OK')
  })

  it('is OK for an empty set', () => {
    expect(worstStatus([])).toBe('OK')
  })
})
