import type { StoreHealthStatus } from '../components/packradar/tokens'

/**
 * Derive a store row's health from the scraper's own failure state.
 *
 * WHY NOT `last_scraped_at` ALONE: it is stamped on **every** attempt regardless
 * of outcome — `updateStoreFailureState` puts it in the base update object with
 * the comment "always record the attempt time so due-based scheduling advances
 * even on a failure/block". So a store returning 403 on every single request has
 * a perpetually fresh `last_scraped_at`. Reading health from it would render an
 * actively-blocked store as **OK**, which is a false-OK on precisely the stores
 * this site exists to surface. A stale timestamp is evidence; a fresh one is not.
 *
 * WHY NOT LATEST-PRODUCT RECENCY (the previous rule): it was a documented
 * stopgap. `useStoreHealth` fetched `scrape_runs` for this, but that table is
 * RLS-restricted to authenticated users, so on the public pages the result is
 * *always* empty and the product-recency fallback was the only live path. It
 * conflates "shop has added no new stock" with "we cannot reach the shop" — a
 * healthy shop with a quiet fortnight read DOWN.
 *
 * WHAT THIS USES INSTEAD: the state `applyFailureOutcome` already maintains on
 * `stores`, which is what the scraper actually concluded. `consecutive_failures`
 * is 0 only after a success; `is_flagged` means 5+ consecutive block-like
 * failures; `is_enabled === false` means it auto-disabled after 12h flagged.
 * Migration 015 grants anon SELECT on `stores`, so this needs no RLS change.
 *
 * Ordered worst-first: a flagged store that was also scraped a minute ago is
 * DOWN, not OK.
 *
 * NOTE it takes no `now` and does no time arithmetic — deliberately. The obvious
 * staleness clause ("not scraped for 2x its interval → SLOW") was drafted and
 * dropped: domain-aware pacing means a row's real period is
 * `rows_on_domain x run_interval`, not its configured interval, so that rule was
 * already false the day it was written. A rule with no clock in it cannot be
 * falsified by the next scheduling change. `last_scraped_at` is used only for
 * presence — never scraped means no evidence, not good news.
 */

export interface StoreStatusInput {
  is_enabled?: boolean | null
  is_flagged?: boolean | null
  consecutive_failures?: number | null
  last_scraped_at?: string | null
}

export function deriveStoreStatus(store: StoreStatusInput): StoreHealthStatus {
  // Auto-disabled after staying flagged past the grace period. Terminal.
  if (store.is_enabled === false) return 'DOWN'
  // 5+ consecutive block-like failures. Still enabled, but being blocked.
  if (store.is_flagged === true) return 'DOWN'

  // Never scraped: no evidence of reachability, so do not claim OK.
  if (!store.last_scraped_at) return 'DOWN'
  if (Number.isNaN(new Date(store.last_scraped_at).getTime())) return 'DOWN'

  // Any current failure streak — the last attempt did not succeed.
  if ((store.consecutive_failures ?? 0) > 0) return 'SLOW'

  // NO STALENESS CLAUSE, deliberately. The obvious rule — "older than ~2x its
  // check_interval_minutes is SLOW" — is already false: since domain-aware pacing
  // (migration-era commit 79bce8d7) the scraper takes at most one row per DOMAIN
  // per run, so a row's real period is `rows_on_that_domain x run_interval`, not
  // its configured interval. lexshop.ro's 9 rows cycle at ~18 min against a
  // nominal 15, and each row added to a domain costs that domain another ~2 min —
  // so a 15-row domain would have every row flapping SLOW while the scraper works
  // perfectly. Store rows are per-game and games arrive in batches, so that is
  // reachable rather than hypothetical.
  //
  // Failure is already covered above by consecutive_failures / is_flagged.
  // "The scheduler has stopped reaching this row" is a different signal — an ops
  // problem rather than a store-health one — and both pages already surface
  // overallLastSweepAt, which is where a stalled sweep shows up.
  return 'OK'
}

/** Worse status wins when several game-rows of one physical shop are merged. */
const SEVERITY: Record<StoreHealthStatus, number> = { OK: 0, SLOW: 1, DOWN: 2 }

export function worstStatus(statuses: StoreHealthStatus[]): StoreHealthStatus {
  return statuses.reduce<StoreHealthStatus>(
    (worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst),
    'OK',
  )
}
