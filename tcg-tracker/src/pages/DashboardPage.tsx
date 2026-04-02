import { useState, useMemo } from 'react'
import { useProducts } from '../hooks/useProducts'
import { useStores } from '../hooks/useStores'
import { AppSidebar } from '../components/AppSidebar'
import type { ProductFilters } from '../hooks/useProducts'

export function DashboardPage() {
  const { stores } = useStores()

  // Filter state
  const [storeFilter, setStoreFilter] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [inStockOnly, setInStockOnly] = useState(true)
  const [search, setSearch] = useState('')

  const filters = useMemo<ProductFilters>(() => ({
    store: storeFilter || undefined,
    minPrice: minPrice ? parseFloat(minPrice) : undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    inStockOnly,
    search: search.trim() || undefined,
  }), [storeFilter, minPrice, maxPrice, inStockOnly, search])

  const { products, loading, loadingMore, hasMore, error, loadMore } = useProducts(filters)

  const clearFilters = () => {
    setStoreFilter('')
    setMinPrice('')
    setMaxPrice('')
    setInStockOnly(true)
    setSearch('')
  }

  const hasActiveFilters = storeFilter || minPrice || maxPrice || !inStockOnly || search

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar activePage="dashboard" />

      {/* Main content */}
      <div className="flex-1 p-8">
        <h1 className="font-headline font-black text-xl text-on-surface uppercase tracking-tight mb-8">
          TCG Tracker
        </h1>
        <h2 className="font-headline text-2xl font-bold text-on-surface mb-4">
          Recently Detected
        </h2>

        {/* Filter bar */}
        <div className="flex flex-wrap items-end gap-3 mb-6">
          <div>
            <label className="block text-on-surface-variant text-xs uppercase tracking-wider mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="px-3 py-2 rounded-lg bg-surface-low text-on-surface text-sm outline-none focus:ring-1 focus:ring-primary min-w-[200px]"
            />
          </div>
          <div>
            <label className="block text-on-surface-variant text-xs uppercase tracking-wider mb-1">Store</label>
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-surface-low text-on-surface text-sm outline-none focus:ring-1 focus:ring-primary min-w-[160px]"
            >
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-on-surface-variant text-xs uppercase tracking-wider mb-1">Min Price</label>
            <input
              type="number"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="0"
              className="w-24 px-3 py-2 rounded-lg bg-surface-low text-on-surface text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-on-surface-variant text-xs uppercase tracking-wider mb-1">Max Price</label>
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="9999"
              className="w-24 px-3 py-2 rounded-lg bg-surface-low text-on-surface text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <input
              type="checkbox"
              id="inStockOnly"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="inStockOnly" className="text-on-surface text-sm">In stock only</label>
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 rounded-lg text-on-surface-variant text-sm hover:bg-surface-high transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {loading && (
          <p className="text-on-surface-variant text-sm">Loading products...</p>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-error/10 text-error text-sm">
            Failed to load products: {error}
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <p className="text-on-surface-variant text-sm">
            No products found.
          </p>
        )}

        {!loading && !error && products.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((product) => (
                <a
                  key={product.id}
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-surface-low rounded-xl overflow-hidden hover:ring-1 hover:ring-primary/50 transition-all"
                >
                  {product.image_url && (
                    <div className="w-full h-40 bg-surface-container">
                      <img
                        src={product.image_url}
                        alt={product.title}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-on-surface-variant text-xs uppercase tracking-wider">
                        {product.store_name}
                      </p>
                      <div className="flex items-center gap-2">
                        {!product.in_stock && (
                          <span className="text-error text-xs font-bold">Out of stock</span>
                        )}
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-on-surface-variant opacity-50">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                      </div>
                    </div>
                    <h3 className="text-on-surface font-headline font-bold text-sm leading-tight mb-2 line-clamp-2">
                      {product.title}
                    </h3>
                    <div className="flex items-center justify-between">
                      <span className="text-primary font-headline font-bold text-lg">
                        {product.price != null ? `${product.price.toFixed(2)} RON` : 'N/A'}
                      </span>
                      <span className="text-on-surface-variant text-xs">
                        {new Date(product.first_seen).toLocaleDateString('ro-RO')}
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 rounded-lg bg-surface-high text-on-surface font-headline font-bold text-sm hover:bg-surface-highest transition-colors disabled:opacity-50"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
