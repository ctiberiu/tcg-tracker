/**
 * Weekly scraper-health digest — an ops email to the operator.
 *
 * Why this exists: store failures are currently invisible until someone goes
 * looking. ATU-Toys was dark across 8 store rows for days and was only found
 * because the user happened to mention the site had changed its links. Smyk has
 * been enabled with zero products ever recorded and nothing flagged it. A
 * Monday-morning email catches that class of problem in hours, not days.
 *
 * Deliberately standalone rather than part of scraper.js:
 *   - scraper.js imports playwright-extra and installs the stealth plugin at
 *     module load. The digest needs neither, so importing it would drag a
 *     browser stack into a job that only runs five SELECTs.
 *   - the scraper cron is every 2 minutes. This must never be on that path.
 * It runs from its own workflow (.github/workflows/digest.yml) on a weekly cron.
 *
 * Transport is the ADMIN one: always Gmail, always to ALERT_EMAIL_TO, and
 * pointedly NOT gated by ALERT_MODE. notifyStoreDisabled() in scraper.js is the
 * precedent. This is ops mail — it costs nothing and is wanted in every
 * environment. It must never touch ZeptoMail or the `subscribers` table, which
 * are the metered, commercial, product-restock path.
 */

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'node:url';
import { FLAG_DISABLE_GRACE_MS } from './block-detection.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * DAY_MS;

/** PostgREST caps a plain select at 1000 rows and does NOT error when it truncates. */
const PAGE_SIZE = 1000;

function initSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_KEY environment variables');
  }
  return createClient(url, key);
}

/**
 * Fetch every row of a query, paginating past PostgREST's default 1000-row cap.
 * Mirrors fetchAllRows in scraper.js — that one silently truncated the products
 * table once it passed 1000 rows and made already-known products look new on
 * every run. A digest that quietly reads only the first 1000 products would
 * report healthy stores as having zero, which is precisely the false alarm this
 * email must not produce.
 */
async function fetchAllRows(queryFactory) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await queryFactory().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

/** Exact row count without transferring the rows. */
async function countRows(queryFactory) {
  const { count, error } = await queryFactory();
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * A single physical store gets one `stores` row per game it's scraped for
 * ("RedGoblin" for Pokémon, "RedGoblin (One Piece)" for One Piece — migrations
 * 025/026), so a row count is roughly 3x the shop count: ATU-Toys is 9 rows and
 * one shop; RamCards, LexShop and TCGarena are 8 each; Krit is 7.
 *
 * SOURCE OF TRUTH is `getStoreBaseName()` in `src/lib/storeName.ts`, used by
 * useStoreHealth.ts and useStoreCounts.ts to merge rows on the stores page.
 * digest.js is ESM under scraper/ and cannot import across into src/, so the
 * regex is duplicated here deliberately. Keep the two identical — a digest that
 * disagrees with the stores page is worse than one that overstates.
 */
function storeBaseName(name) {
  return String(name ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** How many distinct shops a set of rows represents. */
function countStores(rows) {
  return new Set(rows.map((r) => storeBaseName(r.name))).size;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const hours = ms / (60 * 60 * 1000);
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatDate(iso) {
  if (!iso) return 'never';
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

/**
 * Stores disabled since the last digest.
 *
 * There is no `disabled_at` column. `last_scraped_at` is the proxy: fetchStores()
 * filters on is_enabled, so a disabled store is never attempted again and its
 * last_scraped_at freezes at the exact run that disabled it. `flagged_at` is NOT
 * usable here — it records when the flag was first raised, which is at least 12h
 * (FLAG_DISABLE_GRACE_MS) before the disable and often much longer.
 */
function selectNewlyDisabled(stores, since) {
  return stores
    .filter((s) => s.is_enabled === false)
    .filter((s) => s.last_scraped_at && new Date(s.last_scraped_at).getTime() >= since)
    .sort((a, b) => new Date(b.last_scraped_at) - new Date(a.last_scraped_at));
}

/**
 * Currently-flagged stores and how long they have been flagged.
 * A flagged store is still enabled but polled hourly; once it has been
 * continuously flagged for FLAG_DISABLE_GRACE_MS it auto-disables on its next
 * block-like failure, so anything already past that grace is about to go dark.
 */
function selectFlagged(stores, now) {
  return stores
    .filter((s) => s.is_flagged === true && s.is_enabled !== false)
    .map((s) => {
      const flaggedMs = s.flagged_at ? now - new Date(s.flagged_at).getTime() : null;
      return {
        ...s,
        flaggedMs,
        pastGrace: flaggedMs != null && flaggedMs >= FLAG_DISABLE_GRACE_MS,
      };
    })
    .sort((a, b) => (b.flaggedMs ?? 0) - (a.flaggedMs ?? 0));
}

/**
 * THE HIGH-VALUE SECTION: enabled stores producing nothing.
 *
 * This is the cohort nothing else catches. A store here is not flagged, not
 * disabled, and looks healthy on the dashboard — it simply returns no product
 * rows. Smyk is the worked example: enabled, zero products ever recorded, never
 * flagged, invisible for months.
 *
 * Split into two severities because they mean different things:
 *   never  — no product has EVER been recorded for this store. Almost always a
 *            broken search URL or a wrong scraper_type, i.e. it never worked.
 *   stale  — products exist but none has been observed within the window, so it
 *            worked once and has since stopped. Usually a site redesign.
 */
function selectZeroProductStores(stores, productsByStore, windowStart) {
  const never = [];
  const stale = [];

  for (const store of stores) {
    if (store.is_enabled === false) continue;
    const rows = productsByStore.get(store.id) ?? [];
    if (rows.length === 0) {
      never.push({ ...store, lastSeenAt: null });
      continue;
    }
    const lastSeenMs = Math.max(...rows.map((r) => new Date(r.last_seen_at).getTime()));
    if (lastSeenMs < windowStart) {
      stale.push({ ...store, lastSeenAt: new Date(lastSeenMs).toISOString() });
    }
  }

  never.sort((a, b) => a.name.localeCompare(b.name));
  stale.sort((a, b) => new Date(a.lastSeenAt) - new Date(b.lastSeenAt));
  return { never, stale };
}

/**
 * Saturation signal — enabled stores whose recently-seen products are 100% in stock.
 *
 * ⚠️ THIS MEASURES PRE-PAGINATION-FIX BEHAVIOUR. Most scrapers currently fetch
 * page 1 and stop. If every product on page 1 is in stock you never observe the
 * boundary where stock ends, so there is probably more product on page 2 that
 * is not being captured. Where page 1 contains an out-of-stock item, the
 * boundary has been seen and coverage is complete.
 *
 * Epic bc2be4df adds saturation-driven pagination, which will shrink this
 * cohort — that is its purpose. When that lands, revisit THIS FUNCTION ONLY;
 * the rest of the digest is independent of it. Kept deliberately isolated for
 * exactly that reason.
 *
 * Known false positive: a shop that hides out-of-stock product entirely will
 * always look saturated. That is a property of the shop, not a fault.
 */
function selectSaturatedStores(stores, productsByStore, windowStart) {
  const saturated = [];

  for (const store of stores) {
    if (store.is_enabled === false) continue;
    const recent = (productsByStore.get(store.id) ?? []).filter(
      (r) => new Date(r.last_seen_at).getTime() >= windowStart,
    );
    // A handful of products is a small catalogue, not evidence of truncation.
    if (recent.length < 5) continue;
    if (recent.every((r) => r.in_stock === true)) {
      saturated.push({ ...store, recentCount: recent.length });
    }
  }

  return saturated.sort((a, b) => b.recentCount - a.recentCount);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) survives; anything else is rendered as inert escaped text. */
function sanitizeUrl(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return escapeHtml(parsed.href);
  } catch {
    /* fall through */
  }
  return '#';
}

function section(title, bodyHtml) {
  return (
    `<h2 style="font:600 14px/1.4 -apple-system,Segoe UI,sans-serif;margin:26px 0 8px;` +
    `padding-bottom:6px;border-bottom:1px solid #ddd">${escapeHtml(title)}</h2>${bodyHtml}`
  );
}

function emptyNote(text) {
  return `<p style="margin:0;color:#3c763d;font:13px/1.5 -apple-system,Segoe UI,sans-serif">${escapeHtml(text)}</p>`;
}

function storeList(items, renderDetail) {
  const rows = items
    .map(
      (s) =>
        `<li style="margin:0 0 5px"><a href="${sanitizeUrl(s.url)}" style="color:#0066cc;text-decoration:none">` +
        `${escapeHtml(s.name)}</a> <span style="color:#666">— ${renderDetail(s)}</span></li>`,
    )
    .join('');
  return `<ul style="margin:0;padding-left:20px;font:13px/1.5 -apple-system,Segoe UI,sans-serif">${rows}</ul>`;
}

function renderDigest(data) {
  const { newlyDisabled, flagged, zeroProducts, saturated, totals, storeCounts, now } = data;

  // Every number here is explicitly labelled "stores" or "rows". The old header
  // said "67 enabled / 89 stores", which were both ROW counts — overstating the
  // shop count by ~3x — and "22 flagged", which read as contradicting the
  // "No stores are currently flagged" section below (all 22 flagged rows were
  // also disabled, and that section deliberately lists only the enabled ones).
  const flaggedText = storeCounts.flaggedRows === 0
    ? 'none flagged'
    : storeCounts.flaggedEnabledRows === 0
      ? `${storeCounts.flaggedRows} rows flagged, all already disabled`
      : `${storeCounts.flaggedEnabledRows} of ${storeCounts.flaggedRows} flagged rows still enabled`;

  const headline =
    `<p style="font:13px/1.6 -apple-system,Segoe UI,sans-serif;color:#444;margin:0 0 4px">` +
    `Week ending ${escapeHtml(formatDate(new Date(now).toISOString()))} · ` +
    `<strong>${storeCounts.enabledStores} of ${storeCounts.stores} stores enabled</strong> ` +
    `(${storeCounts.enabledRows} of ${storeCounts.rows} game rows) · ` +
    `${escapeHtml(flaggedText)}</p>` +
    `<p style="font:12px/1.5 -apple-system,Segoe UI,sans-serif;color:#777;margin:0 0 4px">` +
    `Sections below are per <strong>row</strong> — one row per shop per game, so a single ` +
    `game category can fail while its siblings stay healthy.</p>`;

  const disabledHtml = newlyDisabled.length
    ? storeList(
        newlyDisabled,
        (s) =>
          `disabled ${escapeHtml(formatDate(s.last_scraped_at))} after ` +
          `${s.consecutive_failures} consecutive block-like failures`,
      )
    : emptyNote(`No rows disabled in the last ${WINDOW_DAYS} days.`);

  const flaggedHtml = flagged.length
    ? storeList(
        flagged,
        (s) =>
          `flagged ${escapeHtml(formatDuration(s.flaggedMs))} (${s.consecutive_failures} failures)` +
          (s.pastGrace ? ' <strong style="color:#a94442">— past the 12h grace, will disable on next failure</strong>' : ''),
      )
    : emptyNote('No enabled rows are currently flagged.');

  const neverHtml = zeroProducts.never.length
    ? storeList(zeroProducts.never, () => 'no product has <strong>ever</strong> been recorded')
    : '';
  const staleHtml = zeroProducts.stale.length
    ? storeList(zeroProducts.stale, (s) => `last product seen ${escapeHtml(formatDate(s.lastSeenAt))}`)
    : '';
  const zeroHtml =
    zeroProducts.never.length || zeroProducts.stale.length
      ? `<p style="margin:0 0 8px;font:13px/1.5 -apple-system,Segoe UI,sans-serif;color:#a94442">` +
        `These rows are <strong>enabled and not flagged</strong>, so nothing else reports them. ` +
        `They are producing no data.</p>${neverHtml}${staleHtml}`
      : emptyNote(`Every enabled row has produced product data in the last ${WINDOW_DAYS} days.`);

  const saturatedHtml = saturated.length
    ? `<p style="margin:0 0 8px;font:13px/1.5 -apple-system,Segoe UI,sans-serif;color:#666">` +
      `Every recently-seen product is in stock, so the end of the catalogue was never observed — ` +
      `these are likely truncating at page 1. Measured against current (pre-pagination-fix) behaviour.</p>` +
      storeList(saturated, (s) => `${s.recentCount} products, all in stock`)
    : emptyNote('No enabled row looks truncated.');

  const delta = totals.addedThisWeek - totals.addedPrevWeek;
  const deltaSign = delta > 0 ? '+' : '';
  const totalsHtml =
    `<ul style="margin:0;padding-left:20px;font:13px/1.5 -apple-system,Segoe UI,sans-serif">` +
    `<li>${totals.total} products tracked in total</li>` +
    `<li>${totals.addedThisWeek} new this week, ${totals.addedPrevWeek} the week before ` +
    `(<strong>${deltaSign}${delta}</strong>)</li>` +
    `<li>${totals.inStock} currently in stock</li>` +
    `</ul>`;

  return (
    `<div style="max-width:680px">` +
    `<h1 style="font:700 18px/1.3 -apple-system,Segoe UI,sans-serif;margin:0 0 2px">PackRadar — weekly scraper health</h1>` +
    headline +
    section('Rows producing nothing (enabled, unflagged, invisible)', zeroHtml) +
    section(`Rows newly disabled (last ${WINDOW_DAYS} days)`, disabledHtml) +
    section('Rows currently flagged (enabled only)', flaggedHtml) +
    section('Rows likely truncating at page 1', saturatedHtml) +
    section('Totals', totalsHtml) +
    `</div>`
  );
}

async function collectDigest(supabase, now = Date.now()) {
  const windowStart = now - WINDOW_MS;
  const prevWindowStart = now - 2 * WINDOW_MS;

  const stores = await fetchAllRows(() => supabase.from('stores').select('*'));

  // Every product row, paginated. Needed per-store rather than aggregated
  // because both the zero-product and saturation sections group by store.
  const products = await fetchAllRows(() =>
    supabase.from('products').select('store_id, in_stock, last_seen_at'),
  );

  const productsByStore = new Map();
  for (const row of products) {
    if (!row.store_id) continue; // store deleted — FK is ON DELETE SET NULL
    const list = productsByStore.get(row.store_id);
    if (list) list.push(row);
    else productsByStore.set(row.store_id, [row]);
  }

  const iso = (ms) => new Date(ms).toISOString();
  const [total, addedThisWeek, addedPrevWeek, inStock] = await Promise.all([
    countRows(() => supabase.from('products').select('*', { count: 'exact', head: true })),
    countRows(() =>
      supabase.from('products').select('*', { count: 'exact', head: true }).gte('first_seen', iso(windowStart)),
    ),
    countRows(() =>
      supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .gte('first_seen', iso(prevWindowStart))
        .lt('first_seen', iso(windowStart)),
    ),
    countRows(() =>
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('in_stock', true),
    ),
  ]);

  return {
    now,
    // Rows and stores are both reported, never interchanged. The header speaks in
    // stores because that is what a reader means by "store"; the detail sections
    // below stay in rows because a single game category can fail while its
    // siblings are healthy — ATU-Toys (One Piece) auto-disabled while its 8
    // siblings sat at zero failures, which is the signal this digest exists for.
    storeCounts: {
      rows: stores.length,
      enabledRows: stores.filter((s) => s.is_enabled !== false).length,
      disabledRows: stores.filter((s) => s.is_enabled === false).length,
      flaggedRows: stores.filter((s) => s.is_flagged === true).length,
      // A flagged row that is ALSO disabled is history, not a warning. The
      // flagged SECTION lists only flagged-and-still-enabled rows (the
      // early-warning case), so the header must distinguish the two or it reads
      // as contradicting the section below it.
      flaggedEnabledRows: stores.filter((s) => s.is_flagged === true && s.is_enabled !== false).length,
      stores: countStores(stores),
      enabledStores: countStores(stores.filter((s) => s.is_enabled !== false)),
    },
    newlyDisabled: selectNewlyDisabled(stores, windowStart),
    flagged: selectFlagged(stores, now),
    zeroProducts: selectZeroProductStores(stores, productsByStore, windowStart),
    saturated: selectSaturatedStores(stores, productsByStore, windowStart),
    totals: { total, addedThisWeek, addedPrevWeek, inStock },
  };
}

/**
 * Admin-only operational mail. Goes to ALERT_EMAIL_TO over Gmail and nowhere
 * else — never getRecipients()/the subscribers table, never ZeptoMail. If the
 * transport is unconfigured the digest is logged to stdout and skipped rather
 * than failing the job; a missed ops email must not look like a scraper outage.
 */
async function sendDigest(html, subject) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const recipients = (process.env.ALERT_EMAIL_TO ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!gmailUser || !gmailPass || recipients.length === 0) {
    console.log('GMAIL_USER / GMAIL_APP_PASSWORD / ALERT_EMAIL_TO not all set — not sending.');
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass },
  });
  await transporter.sendMail({
    from: `TCG Tracker <${gmailUser}>`,
    to: recipients.join(', '),
    subject,
    html,
  });
  console.log(`Digest emailed to ${recipients.length} address(es).`);
  return true;
}

/** Short subject-line summary so the inbox shows severity without opening. */
function buildSubject(data) {
  // Every count in the subject is a ROW count, so each says so — the subject is
  // read before anything that could give it context.
  const rows = (n) => `${n} row${n === 1 ? '' : 's'}`;
  const silent = data.zeroProducts.never.length + data.zeroProducts.stale.length;
  const parts = [];
  if (silent) parts.push(`${rows(silent)} silent`);
  if (data.newlyDisabled.length) parts.push(`${rows(data.newlyDisabled.length)} disabled`);
  if (data.flagged.length) parts.push(`${rows(data.flagged.length)} flagged`);
  return parts.length
    ? `PackRadar weekly health — ${parts.join(', ')}`
    : 'PackRadar weekly health — all clear';
}

async function main() {
  const supabase = initSupabase();
  const data = await collectDigest(supabase);
  const html = renderDigest(data);
  const subject = buildSubject(data);

  // Counts are labelled row/store here for the same reason they are in the email:
  // `stores` is one row per shop per game, so the two differ by roughly 3x.
  const c = data.storeCounts;
  console.log(subject);
  console.log(`  stores: ${c.enabledStores} of ${c.stores} enabled`);
  console.log(`  rows:   ${c.enabledRows} of ${c.rows} enabled, ${c.flaggedRows} flagged (${c.flaggedEnabledRows} still enabled)`);
  console.log(
    `  rows producing nothing: ${data.zeroProducts.never.length} never, ${data.zeroProducts.stale.length} stale`,
  );
  console.log(`  rows newly disabled: ${data.newlyDisabled.length}`);
  console.log(`  rows flagged and still enabled: ${data.flagged.length}`);
  console.log(`  rows likely truncating: ${data.saturated.length}`);
  console.log(`  products: ${data.totals.total} total, ${data.totals.addedThisWeek} new this week`);

  // DIGEST_DRY_RUN=1 renders and logs without sending — used to verify the
  // numbers against a direct DB query before trusting the mail.
  if (process.env.DIGEST_DRY_RUN === '1') {
    console.log('\nDIGEST_DRY_RUN=1 — rendered but not sent.\n');
    console.log(html);
    return;
  }

  await sendDigest(html, subject);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

export {
  collectDigest,
  renderDigest,
  buildSubject,
  selectNewlyDisabled,
  selectFlagged,
  selectZeroProductStores,
  selectSaturatedStores,
};
