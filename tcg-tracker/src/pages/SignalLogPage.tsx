import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProducts, type ProductFilters, type ProductSort } from '../hooks/useProducts'
import { useStores } from '../hooks/useStores'
import { useStoreHealth } from '../hooks/useStoreHealth'
import type { Product } from '../lib/types'
import {
  StatusStrip,
  NavBar,
  PageHeader,
  FilterRack,
  SignalCard,
  CtaButton,
  PackRadarFooter,
  MobileTabBar,
  GAMES,
} from '../components/packradar'

export function SignalLogPage() {
  const [searchParams] = useSearchParams()

  const { stores } = useStores()
  const { overallLastSweepAt, healthy, storeHealths } = useStoreHealth()

  const [storeFilter, setStoreFilter] = useState(searchParams.get('store') ?? '')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  // Hidden for now — we only show in-stock items until that changes.
  const inStockOnly = true
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<ProductSort>('newest')

  const filters = useMemo<ProductFilters>(() => ({
    store: storeFilter || undefined,
    minPrice: minPrice ? parseFloat(minPrice) : undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    inStockOnly,
    search: search.trim() || undefined,
    sort,
  }), [storeFilter, minPrice, maxPrice, inStockOnly, search, sort])

  const { products, loading, loadingMore, hasMore, totalCount, error, loadMore } = useProducts(filters)

  const channels = useMemo(() => {
    const counts = new Map<Product['game'], number>()
    for (const p of products) counts.set(p.game, (counts.get(p.game) ?? 0) + 1)
    return Array.from(counts.entries()).map(([key, count]) => ({ game: GAMES[key], count }))
  }, [products])

  const lastSweepLabel = overallLastSweepAt
    ? `${Math.max(0, Math.round((Date.now() - new Date(overallLastSweepAt).getTime()) / 60000))} MIN AGO`
    : '—'
  const respondingCount = storeHealths.filter((s) => s.status === 'OK').length

  return (
    <div className="packradar pr-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <StatusStrip lastSweepTime={new Date().toLocaleTimeString('ro-RO')} storeCount={stores.length} healthy={healthy} />
      <NavBar active="log" />

      <PageHeader
        title="Signal log"
        crumbCurrent="SIGNAL LOG"
        meta={`${totalCount ?? products.length} SIGNALS · ${respondingCount}/${stores.length} STORES RESPONDING · LAST SWEEP ${lastSweepLabel}`}
      />

      <div style={{ padding: '0 var(--pr-gutter)' }}>
        <FilterRack
          search={search}
          onSearchChange={setSearch}
          store={storeFilter}
          onStoreChange={setStoreFilter}
          storeOptions={stores.map((s) => s.name)}
          minPrice={minPrice}
          onMinPriceChange={setMinPrice}
          maxPrice={maxPrice}
          onMaxPriceChange={setMaxPrice}
          channels={channels}
        />
      </div>

      <div style={{ padding: '28px var(--pr-gutter) 0', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 10, color: 'var(--pr-text-dim)', letterSpacing: 2 }}>
            SHOWING {products.length} OF {totalCount ?? products.length} SIGNALS
          </span>
          <span style={{ fontSize: 10, color: 'var(--pr-text-dim)', letterSpacing: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            SORT:
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as ProductSort)}
                style={{
                  appearance: 'none',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--pr-signal)',
                  fontFamily: 'var(--pr-font-mono)',
                  fontSize: 10,
                  letterSpacing: 2,
                  outline: 'none',
                }}
              >
                <option value="newest">NEWEST</option>
                <option value="price_asc">PRICE LOW-HIGH</option>
                <option value="price_desc">PRICE HIGH-LOW</option>
              </select>
              <span style={{ color: 'var(--pr-signal)' }}>▾</span>
            </span>
          </span>
        </div>

        {loading && (
          <p style={{ color: 'var(--pr-text-dim)', fontSize: 13 }}>Loading signals…</p>
        )}

        {error && (
          <div style={{ padding: 12, border: '1px solid var(--pr-status-gone)', color: 'var(--pr-status-gone)', fontSize: 13 }}>
            Failed to load signals: {error}
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <p style={{ color: 'var(--pr-text-dim)', fontSize: 13 }}>No signals found.</p>
        )}

        {!loading && !error && products.length > 0 && (
          <>
            <div className="pr-signal-grid">
              {products.map((product) => (
                <SignalCard
                  key={product.id}
                  game={GAMES[product.game]}
                  store={product.store_name}
                  date={new Date(product.first_seen).toLocaleDateString('ro-RO')}
                  title={product.title}
                  price={product.price}
                  status={product.in_stock ? 'IN STOCK' : 'GONE'}
                  imageUrl={product.image_url}
                  href={product.url}
                />
              ))}
            </div>
            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0 0' }}>
                <CtaButton variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'LOADING…' : 'LOAD OLDER SIGNALS'}
                </CtaButton>
              </div>
            )}
          </>
        )}
      </div>

      <PackRadarFooter />
      <MobileTabBar active="log" />
    </div>
  )
}
