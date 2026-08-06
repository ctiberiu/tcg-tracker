import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getStoreBaseName } from '../lib/storeName'
import { CARD_WINDOW } from '../lib/gameCards'
import type { Product } from '../lib/types'
import type { GameKey } from '../components/packradar/tokens'

/**
 * Everything a game landing page renders that is not copy: the two counts, the
 * shop list, and the newest in-stock rows the card grid selects from.
 *
 * Deliberately one hook rather than three `useProducts` calls. `useProducts`
 * returns full rows to get a count, and the shop list needs a different
 * population from the card grid (see below), so composing it here would fetch
 * the products table three times over.
 *
 * THREE QUERIES, THREE DIFFERENT POPULATIONS — this is the part worth reading:
 *
 *  1. `totalCount`   every row for the game, in stock or not. HEAD-only, the
 *                    shape `useGameCounts` established: no rows transferred.
 *  2. `shops`        distinct shop over the game's IN-STOCK rows, one column.
 *                    Not the same as the game's `stores` rows: a shop keeps its
 *                    product rows after its store row is disabled, and a shop
 *                    with an enabled store row can hold nothing in stock. Both
 *                    happen today. Verified 2026-08-04 that this definition
 *                    reproduces the approved mockups exactly (pokemon 19,
 *                    yugioh 8, one_piece 8, lorcana 8).
 *  3. `recent`       the newest CARD_WINDOW in-stock rows, full columns, for
 *                    `selectGameCards`.
 *
 * `inStockCount` comes from query 2's exact count, NOT from `shopRows.length`.
 * PostgREST caps a response at 1000 rows; `.range()` raises that, but the count
 * in the Content-Range header is exact regardless, so the figure on the page
 * cannot silently become "1000" the day a game passes that many in-stock rows.
 */

/** Same override `useSweepSummary` uses: `.range()` lifts PostgREST's 1000-row
 *  response cap, where `.limit()` does not. The largest game sits at ~300
 *  in-stock rows today, so this is headroom, not a working limit. */
const SHOP_ROW_CAP = 10000

export interface GameLandingData {
  /** Every tracked product for the game, in stock or not. */
  totalCount: number
  /** Products in stock right now. */
  inStockCount: number
  /** Distinct shop names, suffix stripped, most in-stock product first. The
   *  chip list and the "magazine" figure are the same list, so they cannot
   *  disagree. */
  shops: string[]
  /** Newest in-stock rows, newest first, pre-filter. */
  recent: Product[]
  loading: boolean
  error: string | null
}

/** Stable empty values, so a pending render does not hand the page a new array
 *  identity every time. */
const NO_SHOPS: string[] = []
const NO_ROWS: Product[] = []

/** One state object, tagged with the game it describes. `loading` is DERIVED
 *  from that tag rather than set at the top of the effect: it means "what I
 *  hold is not this game's data", which is true both on first render and for
 *  the render after `game` changes. A separate boolean would leave a window
 *  where Lorcana's figures render under the Pokémon heading. */
interface LoadedGameData {
  game: GameKey
  totalCount: number
  inStockCount: number
  shops: string[]
  recent: Product[]
  error: string | null
}

export function useGameLanding(game: GameKey): GameLandingData {
  const [loaded, setLoaded] = useState<LoadedGameData | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      const [totalRes, shopRes, recentRes] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('game', game),
        supabase
          .from('products')
          .select('store_name', { count: 'exact' })
          .eq('game', game)
          .eq('in_stock', true)
          .range(0, SHOP_ROW_CAP - 1),
        supabase
          .from('products')
          .select('*')
          .eq('game', game)
          .eq('in_stock', true)
          .order('first_seen', { ascending: false })
          .range(0, CARD_WINDOW - 1),
      ])

      if (cancelled) return

      const failed = totalRes.error ?? shopRes.error ?? recentRes.error
      if (failed) {
        setLoaded({
          game,
          totalCount: 0,
          inStockCount: 0,
          shops: NO_SHOPS,
          recent: NO_ROWS,
          error: failed.message,
        })
        return
      }

      // Ordered by how much of the game each shop actually has in stock, not
      // alphabetically. The page shows only the first eleven chips, and
      // alphabetical order buries the shops a reader recognises: for Pokémon it
      // put BookCity, CardXTCG and LibHumanitas on screen while Pokemania,
      // RedGoblin, TCGarena and Transylvania Games fell into "+ încă 8".
      // Name breaks ties so the order is stable between renders.
      const inStockPerShop = new Map<string, number>()
      for (const row of shopRes.data ?? []) {
        const shop = getStoreBaseName(row.store_name)
        inStockPerShop.set(shop, (inStockPerShop.get(shop) ?? 0) + 1)
      }
      const shops = Array.from(inStockPerShop.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ro'))
        .map(([shop]) => shop)

      setLoaded({
        game,
        totalCount: totalRes.count ?? 0,
        inStockCount: shopRes.count ?? 0,
        shops,
        recent: (recentRes.data ?? []) as Product[],
        error: null,
      })
    }

    void fetchAll()
    return () => {
      cancelled = true
    }
  }, [game])

  // Anything held for a DIFFERENT game is not this page's data, so it reads as
  // still loading rather than as stale figures under the new heading.
  const fresh = loaded?.game === game ? loaded : null

  return {
    totalCount: fresh?.totalCount ?? 0,
    inStockCount: fresh?.inStockCount ?? 0,
    shops: fresh?.shops ?? NO_SHOPS,
    recent: fresh?.recent ?? NO_ROWS,
    loading: fresh === null,
    error: fresh?.error ?? null,
  }
}
