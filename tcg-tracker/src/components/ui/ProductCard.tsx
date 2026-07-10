import { Card } from './Card'
import type { Product } from '../../lib/types'

interface ProductCardProps {
  product: Pick<Product, 'title' | 'price' | 'url' | 'image_url' | 'in_stock' | 'store_name' | 'first_seen'>
}

/** The clickable product tile — image, store name, title, price, out-of-stock flag, and first-seen date. Links out to the store's own product page. */
export function ProductCard({ product }: ProductCardProps) {
  return (
    <Card as="a" interactive padding="none" href={product.url} target="_blank" rel="noopener noreferrer">
      {product.image_url && (
        <div className="w-full h-40 bg-surface-container">
          <img src={product.image_url} alt={product.title} className="w-full h-full object-contain" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-on-surface-variant text-xs uppercase tracking-wider">{product.store_name}</p>
          <div className="flex items-center gap-2">
            {!product.in_stock && <span className="text-error text-xs font-bold">Out of stock</span>}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-on-surface-variant opacity-50">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
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
    </Card>
  )
}
