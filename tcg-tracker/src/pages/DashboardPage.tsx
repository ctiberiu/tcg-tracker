import { useAuth } from '../hooks/useAuth'
import { useProducts } from '../hooks/useProducts'

export function DashboardPage() {
  const { signOut } = useAuth()
  const { products, loading, loadingMore, hasMore, error, loadMore } = useProducts()

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-[72px] min-h-screen bg-surface-low flex flex-col items-center py-6 gap-2 shrink-0">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mb-8">
          <span className="text-primary text-lg font-bold">T</span>
        </div>
        <div className="mt-auto">
          <button
            onClick={signOut}
            title="Sign out"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-high hover:text-error transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>
      <div className="flex-1 p-8">
        <h1 className="font-headline font-black text-xl text-on-surface uppercase tracking-tight mb-8">
          TCG Tracker
        </h1>
        <h2 className="font-headline text-2xl font-bold text-on-surface mb-2">
          Recently Detected
        </h2>

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
            No products detected yet.
          </p>
        )}

        {!loading && !error && products.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
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
                    <p className="text-on-surface-variant text-xs uppercase tracking-wider mb-1">
                      {product.store_name}
                    </p>
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
