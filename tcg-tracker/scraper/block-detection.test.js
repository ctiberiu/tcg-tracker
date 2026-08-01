/**
 * classifyOutcome and applyFailureOutcome — the pair that gates auto-disable.
 *
 * These are the highest-value assertions in the scraper: between them they decide
 * whether a store keeps running, gets flagged, or is switched off. Both have cost
 * real stores. ATU-Toys (One Piece) auto-disabled after 17 consecutive strikes
 * while serving 15 products perfectly well — the category was entirely card
 * sleeves, the accessory filter dropped them at source, and an empty array is
 * indistinguishable from a total scrape failure. Separately, 29 stores sat
 * disabled with nobody knowing which had died of what.
 *
 * Pure functions, no I/O, no environment.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyOutcome,
  applyFailureOutcome,
  detectChallengeText,
  BLOCK_FLAG_THRESHOLD,
  FLAG_DISABLE_GRACE_MS,
} from './block-detection.js';

describe('classifyOutcome', () => {
  it('treats 403 and 429 as blocks regardless of what was returned', () => {
    expect(classifyOutcome({ status: 403, rawCount: 50 })).toBe('block');
    expect(classifyOutcome({ status: 429, rawCount: 50 })).toBe('block');
  });

  it('treats a challenge page as a block even on HTTP 200 with products', () => {
    expect(classifyOutcome({ status: 200, challenged: true, rawCount: 50 })).toBe('block');
  });

  it('treats zero products as a block, because the page shape is gone', () => {
    expect(classifyOutcome({ status: 200, rawCount: 0 })).toBe('block');
  });

  it('accepts a confirmed-empty search as success', () => {
    // The opt-in that keeps legitimately-empty categories alive. scrapeAtuToys
    // depends on this for three categories that carry no stock: without it they
    // would score rawCount 0 every run and walk straight back to auto-disabled.
    expect(classifyOutcome({ status: 200, rawCount: 0, confirmedEmpty: true })).toBe('success');
  });

  it('lets a real block beat confirmed-empty', () => {
    // Ordering matters: a 403 while the scraper also reported "no results" is
    // still a block. Otherwise a blocked store could mask itself as healthy.
    expect(classifyOutcome({ status: 403, rawCount: 0, confirmedEmpty: true })).toBe('block');
    expect(classifyOutcome({ status: 200, challenged: true, confirmedEmpty: true })).toBe('block');
  });

  it('does NOT look at how many products survived filtering', () => {
    // Documents a real limitation rather than asserting it is desirable.
    // classifyOutcome only sees rawCount, so a store whose entire catalogue is
    // filtered out reads as `success` — which also RESETS its failure streak and
    // clears any flag (see applyFailureOutcome below). That is the silent-failure
    // mode the weekly digest exists to surface, because nothing else reports it.
    expect(classifyOutcome({ status: 200, rawCount: 15 })).toBe('success');
  });
});

describe('applyFailureOutcome', () => {
  const clean = { consecutiveFailures: 0, isFlagged: false, flaggedAt: null };

  it('resets the streak and clears the flag on success', () => {
    const state = { consecutiveFailures: 4, isFlagged: true, flaggedAt: '2026-07-01T00:00:00Z' };
    expect(applyFailureOutcome(state, 'success')).toEqual({
      consecutiveFailures: 0, isFlagged: false, flaggedAt: null, disable: false,
    });
  });

  it('leaves state untouched on transient, so a network blip cannot advance or reset a streak', () => {
    const state = { consecutiveFailures: 3, isFlagged: true, flaggedAt: '2026-07-01T00:00:00Z' };
    const next = applyFailureOutcome(state, 'transient');
    expect(next.consecutiveFailures).toBe(3);
    expect(next.isFlagged).toBe(true);
    expect(next.disable).toBe(false);
  });

  it('increments on block without flagging below the threshold', () => {
    const next = applyFailureOutcome(clean, 'block');
    expect(next.consecutiveFailures).toBe(1);
    expect(next.isFlagged).toBe(false);
  });

  it('flags exactly at the threshold, and does not disable yet', () => {
    const state = { ...clean, consecutiveFailures: BLOCK_FLAG_THRESHOLD - 1 };
    const next = applyFailureOutcome(state, 'block');
    expect(next.consecutiveFailures).toBe(BLOCK_FLAG_THRESHOLD);
    expect(next.isFlagged).toBe(true);
    expect(next.flaggedAt).not.toBeNull();
    // Flagging is not disabling: the store stays enabled, polled hourly, and only
    // auto-disables after staying flagged for the full grace period.
    expect(next.disable).toBe(false);
  });

  it('does not disable while the flag is younger than the grace period', () => {
    const now = Date.parse('2026-07-31T12:00:00Z');
    const state = {
      consecutiveFailures: 9,
      isFlagged: true,
      flaggedAt: new Date(now - (FLAG_DISABLE_GRACE_MS - 60_000)).toISOString(),
    };
    expect(applyFailureOutcome(state, 'block', now).disable).toBe(false);
  });

  it('disables once the flag has persisted for the full grace period', () => {
    const now = Date.parse('2026-07-31T12:00:00Z');
    const state = {
      consecutiveFailures: 9,
      isFlagged: true,
      flaggedAt: new Date(now - FLAG_DISABLE_GRACE_MS).toISOString(),
    };
    expect(applyFailureOutcome(state, 'block', now).disable).toBe(true);
  });

  it('preserves the original flaggedAt, so the grace clock cannot be reset by more failures', () => {
    // If each new failure re-stamped flaggedAt, a store failing every 15 minutes
    // would never accumulate 12h of continuous flag time and could never disable.
    const flaggedAt = '2026-07-30T00:00:00Z';
    const next = applyFailureOutcome({ consecutiveFailures: 6, isFlagged: true, flaggedAt }, 'block');
    expect(next.flaggedAt).toBe(flaggedAt);
  });

  it('a single success rescues a store one strike from being flagged', () => {
    const state = { ...clean, consecutiveFailures: BLOCK_FLAG_THRESHOLD - 1 };
    expect(applyFailureOutcome(state, 'success').consecutiveFailures).toBe(0);
  });
});

describe('detectChallengeText', () => {
  it('matches real challenge-page phrasing', () => {
    expect(detectChallengeText('Just a moment...')).toBe(true);
    expect(detectChallengeText('Access Denied')).toBe(true);
    expect(detectChallengeText('Verificare de securitate')).toBe(true);
  });

  it('does not fire on healthy pages that merely mention the vendors', () => {
    // Bare `cloudflare`/`captcha` were removed from the pattern after they matched
    // a CDN link, an email-obfuscation script and a hidden form-validation string
    // on perfectly healthy HTTP-200 pages.
    expect(detectChallengeText('<script src="https://cdnjs.cloudflare.com/x.js">')).toBe(false);
    expect(detectChallengeText('recaptcha_response_field')).toBe(false);
  });

  it('is safe on empty and nullish input', () => {
    expect(detectChallengeText('')).toBe(false);
    expect(detectChallengeText(null)).toBe(false);
    expect(detectChallengeText(undefined)).toBe(false);
  });
});
