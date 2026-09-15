// The fast Pokémon lane: page 1 of a few selected stores, every ~2 minutes,
// alongside the main scraper. Pure and dependency-injected so its rules are
// unit-testable; scraper.js wires the real fetch, sync and notify in.
import { classifyOutcome } from './block-detection.js';

/** How often the external cron dispatches .github/workflows/scraper-fast.yml. */
export const FAST_LANE_CADENCE_MINUTES = 2;

/**
 * Stores on the lane, in scrape order. `url` overrides the row's own URL with a
 * newest-first page 1, because the lane only ever reads page 1: on a listing
 * that is not sorted newest-first, page 1 is not where new product appears.
 * Measured 2026-09-15:
 *   RamCards   the row URL sorts "Cele mai cumparate" (best-selling); ?o=news is "Cele mai noi"
 *   Pokemania  ?sort_by=newest reorders page 1 (the row URL does not)
 *   Noriel     product_list_order=created_at, supplied by the operator
 *   RedGoblin  products.json is already created_at-descending; page 1 = the newest 250
 *   Krit       the row URL already carries sort=new
 *   Flamey     11 products in one API page; page 1 is the whole catalogue
 *
 * `everyMinutes` scrapes a store on fewer runs than the lane's cadence, for a
 * host that punishes request rate.
 */
export const FAST_LANE_STORES = [
  {
    id: 'f454e658-d7f7-4889-ab9e-f45d5159f1b7',
    name: 'Noriel',
    url: 'https://noriel.ro/catalogsearch/result/index/?q=Pokemon%20tcg&product_list_order=created_at',
    // Cloudflare. After ~5 page loads in a minute on 2026-09-14 it served one
    // machine 403 on every page for 12h+. Half the lane's rate until the
    // dry run shows the runners staying clean.
    everyMinutes: 4,
  },
  { id: '7d5059b1-7169-4bfe-b3aa-7b8d4f7baa45', name: 'RamCards', url: 'https://www.ramcards.ro/pokemon-tcg?o=news' },
  { id: 'e089c231-456b-44af-b5b9-317c33e6d772', name: 'RedGoblin' },
  { id: '6c29eaf3-4987-4a40-8972-6ec2813edb06', name: 'Flamey' },
  { id: '19b09481-1e08-44d9-b9ea-682fed6f1c9c', name: 'Krit' },
  { id: 'a749e16a-ff62-49f1-a03d-e0515006ff55', name: 'Pokemania', url: 'https://pokemania.ro/seturi-pokemon-tcg?sort_by=newest' },
  { id: 'f01ebeab-2756-4d49-b8e4-c0e727917515', name: 'BebeTei' },
];

/**
 * Which entry point scraper.js runs. An unrecognised value throws instead of
 * falling back to the full scrape: the fast workflow has its own concurrency
 * group, so a typo there would run full scrapes IN PARALLEL with the main job,
 * two jobs hitting every shop at once. Same lesson as the ALERT_MODE gate.
 */
export function resolveLane(value) {
  if (value === undefined || value === '') return 'main';
  if (value === 'fast') return 'fast';
  throw new Error(`Unrecognised SCRAPE_LANE "${value}" — expected "fast" or unset`);
}

/** Dry unless explicitly '0'. A typo or an unset variable must never go live. */
export function isFastLaneDry(value) {
  return value !== '0';
}

/** Whether a store with `everyMinutes` is due on the run starting at `nowMs`. */
export function shouldScrapeThisRun(entry, nowMs, cadenceMinutes = FAST_LANE_CADENCE_MINUTES) {
  if (!entry.everyMinutes || entry.everyMinutes <= cadenceMinutes) return true;
  return Math.floor(nowMs / 60_000) % entry.everyMinutes < cadenceMinutes;
}

/**
 * Turn `stores` rows into what the lane scrapes: configured rows only, in
 * config order, with the newest-first URL and `firstPageOnly` set. Rows are
 * copied, never mutated.
 *
 * Disabled and flagged rows are skipped. Both mean the main scraper has seen
 * this store failing, and a 2-minute page load against a store that is already
 * refusing us is how a flag becomes an auto-disable.
 */
export function prepareFastLaneStores(rows, entries = FAST_LANE_STORES, { nowMs = Date.now(), log = console.log } = {}) {
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const ready = [];
  for (const entry of entries) {
    const row = byId.get(entry.id);
    if (!row) {
      log(`  ${entry.name}: no stores row with id ${entry.id} — skipped`);
      continue;
    }
    if (row.is_enabled !== true) {
      log(`  ${row.name}: disabled — skipped`);
      continue;
    }
    if (row.is_flagged === true) {
      log(`  ${row.name}: flagged by the main scraper — skipped`);
      continue;
    }
    if (!shouldScrapeThisRun(entry, nowMs)) {
      log(`  ${row.name}: not due this run (every ${entry.everyMinutes} min)`);
      continue;
    }
    ready.push({ ...row, url: entry.url ?? row.url, firstPageOnly: true });
  }
  return ready;
}

/**
 * The only sync the lane may use. Empty store-id lists mean the staleness sweep
 * considers no store at all: a page-1 scrape has not seen the rest of the
 * catalogue, and reading its absences as stock-outs is the false-restock cycle.
 */
export function noSweepSync(syncToSupabase) {
  return (products) => syncToSupabase(products, [], []);
}

/**
 * What a live run would alert on: new and in stock, or out of stock -> in stock.
 * `existingStock` is keyed by the url AS STORED, which is normalizeProductUrl's
 * form (lowercased, no query), so products are matched through `normalizeUrl`.
 * Matching raw urls reported 11 RamCards products as new on 2026-09-15: the
 * page links `pok%C3%A9mon`, the row holds `pok%c3%a9mon`.
 */
export function countWouldAlert(products, existingStock, normalizeUrl = (url) => url) {
  const seen = new Set();
  const titles = [];
  let newInStock = 0;
  let restocked = 0;
  for (const p of products) {
    const key = normalizeUrl(p.url);
    if (seen.has(key)) continue;
    seen.add(key);
    if (p.in_stock !== true) continue;
    if (!existingStock.has(key)) {
      newInStock++;
      titles.push(`NEW ${p.store_name}: ${p.title}`);
    } else if (existingStock.get(key) === false) {
      restocked++;
      titles.push(`RESTOCK ${p.store_name}: ${p.title}`);
    }
  }
  return { newInStock, restocked, total: newInStock + restocked, titles };
}

const pauseBetweenStores = () => new Promise((r) => setTimeout(r, 1000 + Math.floor(Math.random() * 1000)));

/**
 * One lane run. Never touches failure state or schedule (that is the main
 * scraper's job), never sweeps, and in dry mode never writes or notifies.
 *
 * Only a `success` outcome contributes products, same rule as the main
 * scraper's commit(): a 403 or challenge page yields nothing to sync.
 */
export async function runFastLane({
  stores,
  dry,
  fetchData,
  keep,
  readExisting,
  sync,
  notify,
  normalizeUrl = (url) => url,
  log = console.log,
  pause = pauseBetweenStores,
  clock = Date.now,
}) {
  const started = clock();
  const products = [];
  const report = [];

  for (const [i, store] of stores.entries()) {
    if (i > 0) await pause();
    const t0 = clock();
    try {
      const { raw = [], status = 0, challenged = false, confirmedEmpty = false } = await fetchData(store);
      const outcome = classifyOutcome({ status, challenged, rawCount: raw.length, confirmedEmpty });
      const kept = outcome === 'success' ? keep(store, raw) : [];
      products.push(...kept);
      const inStock = kept.filter((p) => p.in_stock === true).length;
      const ms = clock() - t0;
      report.push({ store: store.name, ms, status, outcome, raw: raw.length, kept: kept.length, inStock });
      const first = kept.length ? ` — first: ${kept.slice(0, 3).map((p) => p.title).join(' | ')}` : '';
      log(`  ${store.name}: ${outcome} HTTP ${status} in ${(ms / 1000).toFixed(1)}s — ${raw.length} raw, ${kept.length} kept, ${inStock} in stock${first}`);
    } catch (err) {
      const ms = clock() - t0;
      report.push({ store: store.name, ms, status: 0, outcome: 'error', raw: 0, kept: 0, inStock: 0 });
      log(`  ${store.name}: ERROR in ${(ms / 1000).toFixed(1)}s — ${String(err?.message ?? err).split('\n')[0]}`);
    }
  }

  const seconds = ((clock() - started) / 1000).toFixed(1);
  log(`Fast lane: ${stores.length} store(s) in ${seconds}s, ${products.length} products`);

  if (dry) {
    const existing = await readExisting(products.map((p) => normalizeUrl(p.url)));
    const wouldAlert = countWouldAlert(products, existing, normalizeUrl);
    log(`DRY RUN — nothing written, nothing sent. A live run would alert ${wouldAlert.total} (${wouldAlert.newInStock} new in stock, ${wouldAlert.restocked} restocked)`);
    for (const t of wouldAlert.titles.slice(0, 10)) log(`    would alert: ${t}`);
    return { report, products, wouldAlert, alertProducts: [] };
  }

  const { alertProducts = [] } = await sync(products);
  log(`  In stock / restocked (alertable): ${alertProducts.length}`);
  if (alertProducts.length > 0) await notify(alertProducts);
  return { report, products, alertProducts };
}
