/**
 * Per-store before/after harness for the request filter.
 *
 *   node scraper/filter-harness.mjs off      # baseline
 *   node scraper/filter-harness.mjs assets   # with filtering
 *   node scraper/filter-harness.mjs assets "ATU-Toys"   # one store
 *
 * Committed rather than thrown away: this project wrote and discarded ~9
 * verification harnesses before learning a plain .mjs needs no test runner.
 * This one found two things on its first live run that review had not — the
 * confirmedEmpty retry waste, and that filtering FIXES seven page-load
 * timeouts.
 * Reads stores with the ANON key and writes NOTHING to the database.
 *
 * Counts row + non-null price + non-null image_url per store, because a store
 * can return the SAME row count with degraded fields — a script that stops
 * populating prices passes a count-only diff and lands in the DB.
 */
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { fetchStoreData } from './scraper.js';
import { storeHost } from './schedule.js';
chromium.use(StealthPlugin());

const env = Object.fromEntries(fs.readFileSync('../.env','utf8').split('\n')
  .filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const MODE = process.argv[2] || 'off';
const ONLY = process.argv[3];
process.env.SCRAPER_REQUEST_FILTER = MODE;

const { data: all } = await sb.from('stores').select('*').eq('is_enabled', true).order('name');
let stores = all;
if (ONLY) stores = all.filter(s => s.name.toLowerCase().includes(ONLY.toLowerCase()));
// ATU-Toys first: client-rendered, highest breakage risk, test it first not last.
stores.sort((a, b) => (b.name.startsWith('ATU') ? 1 : 0) - (a.name.startsWith('ATU') ? 1 : 0));

const browser = await chromium.launch({ headless: true });
const results = [];
const t0 = Date.now();

// Domain-aware: never two concurrent requests to one host (same reasoning as
// capOnePerDomain — the 2026-07-04 mass auto-disable was burst traffic).
const byHost = new Map();
for (const s of stores) {
  const h = storeHost(s.url) ?? s.id;
  if (!byHost.has(h)) byHost.set(h, []);
  byHost.get(h).push(s);
}
const lanes = [...byHost.values()];
const CONCURRENCY = Math.min(6, lanes.length);

async function runLane(lane) {
  for (const store of lane) {
    const started = Date.now();
    let row = { name: store.name, host: storeHost(store.url), n: 0, price: 0, img: 0, err: null };
    try {
      const { raw } = await fetchStoreData(store, browser);
      row.n = raw.length;
      row.price = raw.filter(p => p.price != null).length;
      row.img = raw.filter(p => p.image_url != null).length;
    } catch (e) { row.err = e.message.split('\n')[0].slice(0, 60); }
    row.ms = Date.now() - started;
    results.push(row);
    process.stderr.write(`  ${MODE} ${row.name.padEnd(30)} n=${String(row.n).padStart(3)} price=${String(row.price).padStart(3)} img=${String(row.img).padStart(3)} ${row.err ? 'ERR ' + row.err : ''}\n`);
  }
}

let li = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (li < lanes.length) await runLane(lanes[li++]);
}));

await browser.close();
results.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(`/tmp/claude-502/-Users-seomonitor-Projects-Test-devchain2/f436a669-898d-4419-89d1-1610345a2e80/scratchpad/filter-${MODE}.json`, JSON.stringify(results, null, 1));
console.log(`\n${MODE}: ${results.length} stores, ${((Date.now()-t0)/1000).toFixed(0)}s, total products ${results.reduce((s,r)=>s+r.n,0)}`);
