// Pure per-store scheduling helper (unit-testable without a live scrape).
// A store is "due" when it has never been scraped, or its own configured
// check_interval_minutes has elapsed since last_scraped_at. A FLAGGED store
// (see block-detection.js) overrides its own interval and checks hourly instead
// — frequent enough to notice recovery quickly, without hammering a store
// that's actively blocking us at its normal (often much shorter) cadence.
import { FLAGGED_CHECK_INTERVAL_MINUTES } from './block-detection.js';

/**
 * @param {{ last_scraped_at?: string|null, check_interval_minutes?: number|null, is_flagged?: boolean }} store
 * @param {number} [nowMs] current time in ms (injectable for tests)
 * @returns {boolean}
 */
export function isStoreDue(store, nowMs = Date.now()) {
  if (!store?.last_scraped_at) return true; // never scraped → always due
  const minutes = store?.is_flagged
    ? FLAGGED_CHECK_INTERVAL_MINUTES
    : Number.isFinite(store.check_interval_minutes) ? store.check_interval_minutes : 15;
  const last = new Date(store.last_scraped_at).getTime();
  if (Number.isNaN(last)) return true; // unparseable timestamp → treat as due (fail safe)
  return nowMs - last >= minutes * 60_000;
}
