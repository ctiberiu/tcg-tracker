export interface Product {
  id: string
  store_name: string
  store_id: string | null
  title: string
  price: number | null
  url: string
  image_url: string | null
  in_stock: boolean
  is_notified: boolean
  first_seen: string
}

export interface Subscriber {
  id: string
  email: string
  is_active: boolean
  created_at: string
}

export type ScraperType = 'pokemonia' | 'shopify' | 'hobby_planet' | 'regatul_jocurilor'

export interface Store {
  id: string
  name: string
  url: string
  scraper_type: ScraperType
  is_enabled: boolean
  in_stock_selector: string | null
  out_of_stock_selector: string | null
  created_at: string
}

export interface ScrapeRun {
  id: string
  store_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  products_found: number | null
  products_new: number | null
  error_message: string | null
  started_at: string
  completed_at: string | null
}
