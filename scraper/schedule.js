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

/**
 * The domain a store row actually talks to. `stores` holds one row per shop PER
 * GAME, so nine rows can be one web server — lexshop.ro is 9 rows, ramcards.ro,
 * atu-toys.ro and tcgarena.ro are 8 each. `www.` is stripped so
 * `www.lexshop.ro` and `lexshop.ro` are one host.
 *
 * Returns null on an unparseable URL; callers must treat that as its own unique
 * bucket rather than lumping every bad row together, so one malformed row can
 * neither block others nor be blocked by them.
 */
export function storeHost(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/** Sort key: how long this row has been waiting. Never-scraped and unparseable
 *  timestamps sort first — both mean "we have no evidence this was ever done". */
function waitingSince(store) {
  if (!store?.last_scraped_at) return -Infinity;
  const t = new Date(store.last_scraped_at).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * Keep at most one store row per domain per run, most-overdue first.
 *
 * Why: the 2-5s inter-store jitter in scrapeAll spaces requests between *rows*,
 * which does nothing when nine of those rows are one server. What a shop saw was
 * nine hits from one IP in ~30s, silence for 15 minutes, then the same again on
 * a precise cycle — the burst signature bot detection exists to catch, and the
 * 2026-07-04 mass auto-disable (several unrelated stores, different platforms,
 * different HTTP statuses, one window) is what that looks like when it fires.
 * Saturation pagination multiplied the exposure by up to 5x per row.
 *
 * Ordering by longest-waiting makes this a per-domain round robin, so a row's
 * period settles at roughly `rows on that domain x effective run interval`
 * rather than growing without bound. Deferred rows age and therefore win their
 * domain on a later run — that is the anti-starvation property, demonstrated
 * over 200 simulated runs rather than asserted.
 *
 * These are steady-state APPROXIMATIONS, not guarantees: GitHub's scheduled cron
 * is best-effort and skews under load, and there is a second trigger source (an
 * external cron-job.org dispatch — see the startup-jitter comment in scrapeAll),
 * so run starts can bunch. Simulated at a 2-minute interval:
 *   - a 15-minute check interval on a 2-minute cron already quantises to a
 *     ~16-minute floor for EVERY row, pacing or not
 *   - only lexshop.ro (9 rows) exceeds that floor, at ~18 min
 *   - the other nineteen domains sit AT the floor, i.e. pacing costs them nothing
 *
 * Safe against the false-restock class that bit the pagination epic: a row that
 * loses its slot is simply absent from the run, and the staleness sweep iterates
 * only `scrapedStoreIds` (pushed in commit()'s success branch), so an unscraped
 * row's products are never swept to out-of-stock. Deferring is not the same as
 * scraping-and-finding-nothing. Relatedly, updateStoreFailureState stamps
 * last_scraped_at on EVERY outcome — success, block and transient alike — so a
 * persistently failing row still advances its rotation position and can neither
 * starve its domain-mates nor itself.
 *
 * KNOWN LIMITATION: the 2026-07-04 mass auto-disable was attributed to a shared
 * WAF/CDN bot score, which can span DIFFERENT domains sitting behind the same
 * provider. Grouping by domain is the right proxy for the per-shop burst and the
 * right scope for this change, but it will not catch that cross-domain case — so
 * a burst-shaped failure recurring across unrelated domains is not evidence this
 * failed. It was never aimed at that.
 *
 * NOTE this filters an ALREADY-DUE set. It does not change due-ness: isStoreDue
 * above, including its flagged-store hourly override, is untouched.
 *
 * @returns {{ selected: object[], deferred: object[] }}
 */
export function capOnePerDomain(stores) {
  const ordered = [...(stores ?? [])].sort((a, b) => {
    const diff = waitingSince(a) - waitingSince(b);
    if (diff !== 0 && Number.isFinite(diff)) return diff;
    if (waitingSince(a) !== waitingSince(b)) return waitingSince(a) === -Infinity ? -1 : 1;
    // Deterministic tie-break. Rows seeded together share a timestamp, and
    // without this the winner would depend on array order — leaving one row
    // persistently unlucky rather than merely later in the rotation.
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  });

  const claimed = new Set();
  const selected = [];
  const deferred = [];
  for (const store of ordered) {
    const host = storeHost(store?.url) ?? `unparseable:${store?.id}`;
    if (claimed.has(host)) {
      deferred.push(store);
      continue;
    }
    claimed.add(host);
    selected.push(store);
  }
  return { selected, deferred };
}
