import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { storeProductCountsArgs, sumCountsByBaseName } from './storeCounts'
import type { StoreProductCount } from './types'

describe('storeProductCountsArgs', () => {
  it('sends every argument, defaulted, when no filter is set', () => {
    expect(storeProductCountsArgs({})).toEqual({
      p_games: null,
      p_min_price: null,
      p_max_price: null,
      p_in_stock_only: false,
      p_search: null,
    })
  })

  // PostgREST resolves the function by argument NAME. One misspelt key and the
  // call fails with PGRST202, which the hook renders as "no counts": every shop
  // in the dropdown reads 0 and nothing throws. So compare against the SQL
  // itself rather than against a second copy of the names.
  it('sends exactly the parameters migration 041 declares', () => {
    const sql = readFileSync(
      fileURLToPath(new URL('../../supabase/migrations/041_store_product_counts_rpc.sql', import.meta.url)),
      'utf8',
    )
    const signature = sql.match(/^CREATE OR REPLACE FUNCTION store_product_counts\(([^)]*)\)/m)
    expect(signature).not.toBeNull()
    const declared = [...signature![1].matchAll(/^\s*(p_\w+)\s/gm)].map((m) => m[1]).sort()
    expect(declared).toHaveLength(5)
    expect(Object.keys(storeProductCountsArgs({})).sort()).toEqual(declared)
  })

  it('treats an empty games list as no game filter', () => {
    expect(storeProductCountsArgs({ games: [] }).p_games).toBeNull()
    expect(storeProductCountsArgs({ games: ['magic', 'pokemon'] }).p_games).toEqual(['magic', 'pokemon'])
  })

  it('keeps a price bound of 0 rather than dropping it as falsy', () => {
    const args = storeProductCountsArgs({ minPrice: 0, maxPrice: 150 })
    expect(args.p_min_price).toBe(0)
    expect(args.p_max_price).toBe(150)
  })

  it('treats an empty search as no search', () => {
    expect(storeProductCountsArgs({ search: '' }).p_search).toBeNull()
    expect(storeProductCountsArgs({ search: 'booster' }).p_search).toBe('booster')
  })

  it('passes the in-stock flag through', () => {
    expect(storeProductCountsArgs({ inStockOnly: true }).p_in_stock_only).toBe(true)
  })
})

describe('sumCountsByBaseName', () => {
  const stores = [
    { id: 'rg-pokemon', name: 'RedGoblin' },
    { id: 'rg-one-piece', name: 'RedGoblin (One Piece)' },
    { id: 'krit', name: 'Krit' },
  ]

  it('sums a shop across its per-game store rows', () => {
    const counts = sumCountsByBaseName(
      [
        { store_id: 'rg-pokemon', product_count: 12 },
        { store_id: 'rg-one-piece', product_count: 3 },
        { store_id: 'krit', product_count: 7 },
      ],
      stores,
    )
    expect(counts).toEqual({ RedGoblin: 15, Krit: 7 })
  })

  it('drops a row for a store id it has no name for', () => {
    expect(sumCountsByBaseName([{ store_id: 'unknown', product_count: 4 }], stores)).toEqual({})
  })

  // count(*) is bigint. PostgREST sends it as a JSON number today; if it ever
  // arrives as a string, `+` would concatenate ("0" + "12" + "3") instead of add.
  it('adds counts that arrive as strings instead of concatenating them', () => {
    const rows = [
      { store_id: 'rg-pokemon', product_count: '12' },
      { store_id: 'rg-one-piece', product_count: '3' },
    ] as unknown as StoreProductCount[]
    expect(sumCountsByBaseName(rows, stores)).toEqual({ RedGoblin: 15 })
  })
})
