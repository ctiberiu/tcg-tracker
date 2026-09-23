import { describe, it, expect } from 'vitest'
import { isDatabaseUnavailable, dbError, databaseOutageLines } from './db-availability.js'

/**
 * This classifier decides whether a failed run emails the operator.
 *
 * Both directions are dangerous, and they are not symmetrical:
 *
 *   - Too eager, and a genuine bug (a renamed column, a revoked key) is
 *     reclassified as "Supabase was down", exits 0, and nobody is told. The
 *     scraper would sit there writing nothing, green, indefinitely.
 *   - Too shy, and the 2026-09-22 outage repeats: two hours of failure emails
 *     every two minutes from two workflows, none of them actionable.
 *
 * So the outage cases below are pinned to strings this repo's own Actions logs
 * actually produced, and the fault cases are pinned to the mistakes most likely
 * to LOOK like an outage. The fault half matters more than the outage half.
 */

/** A PostgrestError as supabase-js delivers it: code, details, hint, message. */
const postgrest = (code, message, extra = {}) => ({ code, message, details: null, hint: null, ...extra })

describe('outages, using the exact errors this incident produced', () => {
  // main scraper run 35704971623, 2026-09-22T08:33:51Z, the first hard failure.
  it('recognises a statement timeout by SQLSTATE 57014', () => {
    const err = dbError('Failed to fetch existing products', postgrest('57014', 'canceling statement due to statement timeout'))
    expect(isDatabaseUnavailable(err)).toBe(true)
  })

  // fast lane run 35705343616, 2026-09-22T08:38:08Z.
  it('recognises PostgREST giving up upstream', () => {
    const err = dbError('Failed to fetch fast-lane stores', { message: 'upstream request timeout' })
    expect(isDatabaseUnavailable(err)).toBe(true)
  })

  // What `supabase db query` reported throughout the outage, and what the
  // pooler produces when it accepts TCP but never completes a login.
  it('recognises a connection that was accepted and then dropped', () => {
    expect(isDatabaseUnavailable(new Error('Connection terminated due to connection timeout'))).toBe(true)
  })

  it('recognises undici giving up on the socket', () => {
    const err = new Error('Failed to fetch stores: fetch failed')
    err.cause = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })
    expect(isDatabaseUnavailable(err)).toBe(true)
  })

  it.each(['57P01', '57P03', '53300', '08006'])('treats SQLSTATE %s as unavailable', (code) => {
    expect(isDatabaseUnavailable(dbError('Failed to fetch stores', postgrest(code, 'server unavailable')))).toBe(true)
  })

  it.each([408, 429, 502, 503, 504])('treats HTTP %i as unavailable', (status) => {
    expect(isDatabaseUnavailable(dbError('Failed to fetch stores', { message: 'upstream', status }))).toBe(true)
  })

  it('sees through a wrapper to the cause', () => {
    const inner = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    expect(isDatabaseUnavailable(new Error('Sync failed', { cause: inner }))).toBe(true)
  })
})

describe('our own bugs, which must keep failing loudly', () => {
  // The failure mode this classifier could most easily hide: a migration renames
  // a column, every run exits 0, and the scraper writes nothing for days.
  it('does NOT excuse a missing column (PGRST204)', () => {
    const err = dbError('Failed to fetch existing products', postgrest('PGRST204', "Could not find the 'in_stok' column of 'products'"))
    expect(isDatabaseUnavailable(err)).toBe(false)
  })

  it('does NOT excuse a missing table (42P01)', () => {
    expect(isDatabaseUnavailable(dbError('Failed to fetch stores', postgrest('42P01', 'relation "storez" does not exist')))).toBe(false)
  })

  it('does NOT excuse a revoked or wrong key', () => {
    expect(isDatabaseUnavailable(dbError('Failed to fetch stores', { message: 'Invalid API key', status: 401 }))).toBe(false)
  })

  it('does NOT excuse an RLS refusal', () => {
    expect(isDatabaseUnavailable(dbError('Failed to write', postgrest('42501', 'new row violates row-level security policy')))).toBe(false)
  })

  it('does NOT excuse a plain programming error', () => {
    expect(isDatabaseUnavailable(new ReferenceError('complete is not defined'))).toBe(false)
    expect(isDatabaseUnavailable(new TypeError("Cannot read properties of undefined (reading 'url')"))).toBe(false)
  })

  it('does NOT excuse a unique violation', () => {
    expect(isDatabaseUnavailable(dbError('Failed to upsert', postgrest('23505', 'duplicate key value violates unique constraint')))).toBe(false)
  })

  // A hostname that does not resolve is a wrong SUPABASE_URL, not an outage.
  it('does NOT excuse an unresolvable host', () => {
    const err = new Error('fetch failed')
    err.cause = Object.assign(new Error('getaddrinfo ENOTFOUND wrong.supabase.co'), { code: 'ENOTFOUND' })
    expect(isDatabaseUnavailable(err)).toBe(false)
  })

  // The laundering case: an outage-shaped message wrapped around a schema fault.
  // The fault wins, because a false green is the more expensive mistake.
  it('does NOT let an outage-shaped wrapper hide a schema fault', () => {
    const inner = postgrest('PGRST204', "Could not find the 'price' column")
    const err = new Error('fetch failed: upstream request timeout', { cause: inner })
    expect(isDatabaseUnavailable(err)).toBe(false)
  })

  it.each([null, undefined, '', 0, 'a string, not an error'])('treats %p as a real fault rather than an outage', (bad) => {
    expect(isDatabaseUnavailable(bad)).toBe(false)
  })
})

describe('dbError keeps what the old throw sites threw away', () => {
  it('preserves code, details, hint and status', () => {
    const err = dbError('Failed to fetch existing products', postgrest('57014', 'canceling statement due to statement timeout', {
      details: 'some detail',
      hint: 'some hint',
      status: 504,
    }))
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('Failed to fetch existing products: canceling statement due to statement timeout')
    expect(err.code).toBe('57014')
    expect(err.details).toBe('some detail')
    expect(err.hint).toBe('some hint')
    expect(err.status).toBe(504)
  })

  it('keeps the original as cause', () => {
    const original = postgrest('08006', 'connection failure')
    expect(dbError('Failed to fetch stores', original).cause).toBe(original)
  })

  it('survives an error with no message', () => {
    expect(dbError('Failed', undefined).message).toBe('Failed: undefined')
  })

  // The regression that motivated dbError: flattening to a string dropped the
  // code, leaving regex matching as the only classifier.
  it('is what makes SQLSTATE classification possible at the catch site', () => {
    const flattened = new Error(`Failed to fetch existing products: ${postgrest('57014', 'nope').message}`)
    expect(flattened.code).toBeUndefined()
    expect(dbError('Failed to fetch existing products', postgrest('57014', 'nope')).code).toBe('57014')
  })
})

describe('databaseOutageLines', () => {
  it('emits a GitHub warning annotation so a skipped run is not silently green', () => {
    const lines = databaseOutageLines('Fast lane', new Error('upstream request timeout'))
    expect(lines.some((l) => l.startsWith('::warning::'))).toBe(true)
    expect(lines.join('\n')).toContain('upstream request timeout')
  })

  it('names the lane it skipped', () => {
    expect(databaseOutageLines('Scraper', new Error('x'))[0]).toContain('Scraper skipped')
  })
})
