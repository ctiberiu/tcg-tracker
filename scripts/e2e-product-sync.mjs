// End-to-end check of syncToSupabase's skip rule against a REAL PostgREST and
// Postgres, never prod: the real function, real postgrest-js, PostgREST v14.4
// and Postgres 17.6.1.084 (prod's versions) built from supabase/migrations.
// Prints, per run, the sync log line beside the database's own n_tup_* deltas.
//
// Setup (Docker), from the repo root:
//   docker network create skipnet
//   docker run -d --name pgskip --network skipnet -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.084
//   for f in $(ls supabase/migrations/*.sql | sort); do docker exec -i pgskip psql -U postgres -v ON_ERROR_STOP=1 -q < $f; done
//   docker run -d --name rest-skip --network skipnet -p 3001:3000 \
//     -e PGRST_DB_URI=postgres://postgres:postgres@pgskip:5432/postgres -e PGRST_DB_ANON_ROLE=postgres \
//     -e PGRST_DB_SCHEMAS=public -e PGRST_DB_MAX_ROWS=1000 postgrest/postgrest:v14.4
//   (cd scraper && npm ci --include=dev)
//   node scripts/e2e-product-sync.mjs
// Re-run from empty: docker exec pgskip psql -U postgres -c "truncate products, product_stock_events"
//
// The 11 s waits matter: PostgREST's pooled backends flush pg_stat counters only
// after ~10 s idle, so a shorter wait attributes each run's writes to the next.
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const require = createRequire(new URL('../scraper/package.json', import.meta.url))
const { PostgrestClient } = require('@supabase/postgrest-js')
const { syncToSupabase } = await import('../scraper/scraper.js')

const sql = (q) => execFileSync('docker', ['exec', 'pgskip', 'psql', '-U', 'postgres', '-tA', '-F', ' ', '-c', q]).toString().trim()
const db = new PostgrestClient('http://localhost:3001')
const MIN = 60_000

const STORE = '11111111-1111-1111-1111-111111111111'
sql(`insert into stores (id, name, url, scraper_type, check_interval_minutes, is_enabled)
     values ('${STORE}', 'E2E Shop', 'https://shop.example', 'shopify', 15, true) on conflict (id) do nothing`)

// 400 products. Every 10th has a long percent-encoded (diacritics) path and an
// uppercase escape in the scraped form, as RamCards serves them; 1 in 4 is out of stock.
const products = Array.from({ length: 400 }, (_, i) => ({
  store_id: STORE,
  store_name: 'E2E Shop',
  title: `Pokemon TCG product ${i}`,
  price: Math.round((19.99 + i * 1.25) * 100) / 100,
  url:
    i % 10 === 0
      ? `https://www.ramcards.ro/${'Pok%C3%A9mon-%C8%98i-'.repeat(7)}produs-${i}?ref=listing`
      : `https://shop.example/products/pokemon-tcg-product-${i}`,
  image_url: `https://cdn.shop.example/${i}.jpg`,
  in_stock: i % 4 !== 0,
  game: 'pokemon',
}))

const counters = () => {
  const [ins, upd, hot] = sql(
    "select pg_stat_force_next_flush(); select n_tup_ins, n_tup_upd, n_tup_hot_upd from pg_stat_user_tables where relname='products'",
  ).split('\n').pop().split(' ').map(Number)
  return { ins, upd, hot }
}

const t0 = Date.parse('2026-10-29T12:00:00Z')
async function round(label, list, nowMs) {
  await new Promise((r) => setTimeout(r, 11_000))
  const before = counters()
  const lines = []
  const orig = console.log
  console.log = (...a) => lines.push(a.join(' '))
  let res
  try {
    res = await syncToSupabase(list, [], [], { supabase: db, now: () => nowMs })
  } finally {
    console.log = orig
  }
  await new Promise((r) => setTimeout(r, 11_000))
  const after = counters()
  console.log(`\n== ${label}`)
  for (const l of lines.filter((l) => /Products:|Stock events:/.test(l))) console.log(l)
  console.log(
    `   db: inserts=${after.ins - before.ins} updates=${after.upd - before.upd} hot=${after.hot - before.hot}` +
      `  returned: inserted=${res.inserted} updated=${res.updated} skipped=${res.skipped} alerts=${res.alertProducts.length}`,
  )
  return res
}

await round('run 1 (t0): first sighting of 400 products', products, t0)
await round('run 2 (t0 + 2 min): same 400, nothing changed', products, t0 + 2 * MIN)
await round('run 3 (t0 + 59 min): same 400, still inside the hour', products, t0 + 59 * MIN)
await round('run 4 (t0 + 60 min): same 400, last_seen_at now due', products, t0 + 60 * MIN)
const changed = products.map((p, i) =>
  i === 1 ? { ...p, price: p.price + 5 } : i === 2 ? { ...p, title: p.title + ' (EN)' } : i === 4 ? { ...p, in_stock: true } : p,
)
await round('run 5 (t0 + 62 min): 1 price change, 1 title change, 1 restock (#4 was out)', changed, t0 + 62 * MIN)
await round('run 6 (t0 + 64 min): one new product', [...changed, { ...products[3], url: 'https://shop.example/products/brand-new' }], t0 + 64 * MIN)

const stale = sql("select count(*) from products where last_seen_at < '2026-10-29T13:00:00Z'")
console.log(`\nrows with last_seen_at before t0+60min: ${stale} (run 4 refreshed all 400)`)
console.log(`percent-encoded RamCards-style rows stored: ${sql("select count(*) from products where url like 'https://www.ramcards.ro/%'")} of 40, all lowercase: ${sql("select bool_and(url = lower(url)) from products where url like 'https://www.ramcards.ro/%'")}`)
