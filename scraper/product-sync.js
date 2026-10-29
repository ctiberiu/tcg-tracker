// What syncToSupabase writes, and what it reads first. Pure apart from
// readExistingProducts, so the skip rule is unit-testable on its own.
//
// ── Why rows are skipped ─────────────────────────────────────────────────────
// Until 2026-10 every scraped product was upserted on every run, unchanged or
// not, because last_seen_at = now() differed every time. That was ~394k row
// writes a day across both lanes (2026-10-27: main 372 runs x ~635 products,
// fast lane 451 runs x ~350) for a ~3,900-row table, and the database ran out of
// Disk IO twice (2026-10-28, 2026-10-29). Most of those writes changed nothing
// but the timestamp.
//
// ── The invariant the staleness sweep relies on ──────────────────────────────
// A scraped row is written when it is new, when its content changed, or when
// its stored last_seen_at is LAST_SEEN_REFRESH_MS old or older. Every writer of
// last_seen_at goes through planProductWrites (both lanes), so at all times:
//
//     true last sighting - stored last_seen_at  <  LAST_SEEN_REFRESH_MS
//
// The sweep (scraper.js sweepCutoffMs) subtracts LAST_SEEN_REFRESH_MS from its
// cutoff for exactly that reason. A product it sweeps has stored last_seen_at
// <= now - grace - R, so its true last sighting is < now - grace: it has been
// missing for longer than the grace, never shorter. The cost is that a real
// sellout detected by absence lands up to R later than before.

import { dbError } from './db-availability.js';

/** How stale a stored last_seen_at may get before an unchanged sighting
 *  rewrites it. Larger saves more writes and delays absence-detected sellouts
 *  by up to this much. 60 minutes: an unchanged product is written ~20-24 times
 *  a day instead of ~60 (main lane) or ~450 (fast lane). */
export const LAST_SEEN_REFRESH_MS = 60 * 60 * 1000;

/** Columns read before the write. url/in_stock/out_of_stock_since/price feed new
 *  and restock detection and the stock-event log (see migration 037); the rest
 *  are what change detection compares; last_seen_at drives the refresh. */
export const EXISTING_COLUMNS =
  'url, in_stock, out_of_stock_since, price, title, image_url, game, store_id, store_name, last_seen_at';

/** URLs per `.in('url', …)` request. readExistingStock has read in chunks of 40
 *  in production since 2026-09-15. The 40 longest product URLs (max 172 chars)
 *  encode to ~6.2 kB of query string. */
export const URL_CHUNK = 40;

/** The row the upsert sends, from a scraped product. `url` must already be
 *  normalizeProductUrl's form, which is how products.url is stored. */
export function toProductRow(p, url, nowIso) {
  return {
    store_name: p.store_name,
    store_id: p.store_id ?? null,
    title: p.title,
    price: p.price,
    url,
    image_url: p.image_url,
    in_stock: p.in_stock ?? true,
    game: p.game ?? 'pokemon',
    // Stamped on every written sighting. The staleness sweep reads it, so it may
    // only be skipped within the bound described at the top of this file.
    last_seen_at: nowIso,
  };
}

const same = (a, b) => (a ?? null) === (b ?? null);

// numeric arrives from PostgREST as a JSON number. Compare by value so 49.9 and
// 49.90 are the same price, and null only equals null.
const samePrice = (a, b) => (a == null || b == null ? a == null && b == null : Number(a) === Number(b));

/** Which content columns differ between the row about to be sent and the stored
 *  one. Empty means only last_seen_at would change. */
export function changedColumns(row, existing) {
  const changed = [];
  if (!samePrice(row.price, existing.price)) changed.push('price');
  for (const col of ['in_stock', 'title', 'image_url', 'game', 'store_id', 'store_name']) {
    if (!same(row[col], existing[col])) changed.push(col);
  }
  return changed;
}

/**
 * Split rows into the ones to write and the ones to skip.
 * `existing` is a Map keyed by stored (normalized) url.
 */
export function planProductWrites(rows, existing, nowMs, refreshMs = LAST_SEEN_REFRESH_MS) {
  const write = [];
  const counts = { new: 0, changed: 0, refreshed: 0, skipped: 0 };
  for (const row of rows) {
    const prev = existing.get(row.url);
    if (!prev) {
      counts.new++;
      write.push(row);
      continue;
    }
    if (changedColumns(row, prev).length > 0) {
      counts.changed++;
      write.push(row);
      continue;
    }
    const seenMs = prev.last_seen_at ? new Date(prev.last_seen_at).getTime() : NaN;
    // An unreadable timestamp is refreshed: skipping it would leave the sweep
    // with no bound on how stale it is.
    if (!Number.isFinite(seenMs) || nowMs - seenMs >= refreshMs) {
      counts.refreshed++;
      write.push(row);
      continue;
    }
    counts.skipped++;
  }
  return { write, counts };
}

/**
 * The stored rows for exactly these urls, keyed by url. Bounded by the number of
 * urls asked for, unlike the full-table read it replaced. Throws dbError so an
 * outage is reported as one (see db-availability.js).
 */
export async function readExistingProducts(supabase, urls, columns = EXISTING_COLUMNS, chunk = URL_CHUNK) {
  const rows = new Map();
  const unique = [...new Set(urls)];
  let requests = 0;
  for (let i = 0; i < unique.length; i += chunk) {
    const { data, error } = await supabase.from('products').select(columns).in('url', unique.slice(i, i + chunk));
    requests++;
    if (error) throw dbError('Failed to fetch existing products', error);
    for (const row of data ?? []) rows.set(row.url, row);
  }
  return { rows, requests };
}

/** The per-run line. Printed unconditionally, zeros included: a run that wrote
 *  nothing and a run where this code never ran must not look the same. */
export function formatSyncLine({ counts, written, failed, read }) {
  const total = counts.new + counts.changed + counts.refreshed;
  return (
    `  Products: ${written}/${total} written (new ${counts.new}, changed ${counts.changed}, ` +
    `refreshed ${counts.refreshed}${failed ? `, FAILED ${failed}` : ''}), ${counts.skipped} skipped unchanged; ` +
    `read ${read.rows} existing row(s) for ${read.urls} scraped url(s) in ${read.requests} request(s)`
  );
}
