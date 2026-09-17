import type { GameKey } from '../components/packradar/tokens'
import { getStoreBaseName } from './storeName'
import type { Store, StoreProductCount } from './types'

export interface StoreCountFilters {
  games?: GameKey[]
  minPrice?: number
  maxPrice?: number
  inStockOnly?: boolean
  search?: string
}

/**
 * The body sent to `store_product_counts` (migration 041).
 *
 * All five keys are always sent. PostgREST picks a function by the NAMES of the
 * arguments it receives, so a misspelt key does not arrive as NULL — the whole
 * call fails with PGRST202, and useStoreCounts renders a failure as no counts.
 * The node test checks these keys against the migration's parameter list.
 */
export interface StoreProductCountsArgs {
  p_games: GameKey[] | null
  p_min_price: number | null
  p_max_price: number | null
  p_in_stock_only: boolean
  p_search: string | null
}

/**
 * Maps the hook's filters onto the function's arguments with the same
 * truthiness the old PostgREST query applied, so the counts keep describing the
 * rows the product list shows:
 *
 * - an empty `games` list is no game filter (the old `games.length > 0` guard)
 * - a price bound of 0 is still a bound (the old `!= null`), so it excludes
 *   products with no price
 * - an empty search is no search
 */
export function storeProductCountsArgs(filters: StoreCountFilters): StoreProductCountsArgs {
  return {
    p_games: filters.games && filters.games.length > 0 ? filters.games : null,
    p_min_price: filters.minPrice ?? null,
    p_max_price: filters.maxPrice ?? null,
    p_in_stock_only: Boolean(filters.inStockOnly),
    p_search: filters.search || null,
  }
}

/**
 * Folds per-store-row counts into one count per shop. A shop has one `stores`
 * row per game (see storeName.ts) and the dropdown lists shops, so "RedGoblin"
 * and "RedGoblin (One Piece)" sum into one entry. A row for a store id missing
 * from `stores` is dropped.
 */
export function sumCountsByBaseName(
  rows: StoreProductCount[],
  stores: Pick<Store, 'id' | 'name'>[],
): Record<string, number> {
  const idToBaseName = new Map(stores.map((s) => [s.id, getStoreBaseName(s.name)]))
  const result: Record<string, number> = {}
  for (const row of rows) {
    const baseName = idToBaseName.get(row.store_id)
    if (!baseName) continue
    result[baseName] = (result[baseName] ?? 0) + Number(row.product_count)
  }
  return result
}

/** One row of the Store dropdown on /view. */
export interface StoreCountOption {
  name: string
  /**
   * null when the page does not have this count: the query is still out, or it
   * failed. Deliberately not 0 — a shop missing from `counts` matched no
   * products, which is a measurement, and rendering both as "0" hands the
   * visitor a failed request dressed as one.
   */
  count: number | null
}

/**
 * The dropdown's rows, most matches first.
 *
 * `unknown` is the two states with nothing to sort by, so the rows keep the
 * order the base names arrive in — the page sorts those alphabetically, which
 * is also what the list falls back to. The name tie-break is written out rather
 * than left to sort stability: shops tie on count constantly, most of them on
 * zero.
 */
export function storeCountOptions(
  baseNames: string[],
  counts: Record<string, number>,
  unknown = false,
): StoreCountOption[] {
  if (unknown) return baseNames.map((name) => ({ name, count: null }))
  return baseNames
    .map((name) => ({ name, count: counts[name] ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
