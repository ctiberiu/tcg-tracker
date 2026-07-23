import type { GameKey } from '../components/packradar/tokens'

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
  game: GameKey
}

export interface Subscriber {
  id: string
  email: string
  is_active: boolean
  created_at: string
}

export type ScraperType =
  | 'pokemonia'
  | 'shopify'
  | 'hobby_planet'
  | 'regatul_jocurilor'
  | 'magento'
  | 'krit'
  | 'smyk'
  | 'ozone'
  | 'woocommerce'
  | 'woocommerce_api'
  | 'flamey_api'
  | 'secretcards_api'
  | 'lumea_jocurilor'
  | 'raijucarii'
  | 'tulli'
  | 'bebetei'
  | 'carturesti'
  | 'foon'
  | 'opencart'
  | 'gomag'
  | 'pokemania'

export interface Store {
  id: string
  name: string
  url: string
  scraper_type: ScraperType
  is_enabled: boolean
  in_stock_selector: string | null
  out_of_stock_selector: string | null
  created_at: string
  game: GameKey
  is_flagged: boolean
  flagged_at: string | null
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

// ── Snipe auto-purchase (Phase 4) ──
export type SnipePaymentMethod = 'ramburs' | 'card'
export type SnipeMode = 'link' | 'keywords'
export type SnipeTaskStatus =
  | 'idle'
  | 'running'
  | 'grabbed'
  | 'awaiting_payment'
  | 'ordered'
  | 'failed'

export interface SnipeFlow {
  id: string
  user_id: string
  site: string
  payment_method: SnipePaymentMethod
  shipping_method: string | null
  address: string | null
  created_at: string
  updated_at: string
}

export interface SnipeTask {
  id: string
  user_id: string
  flow_id: string
  mode: SnipeMode
  url: string | null
  keywords: string[] | null
  desired_qty: number
  respect_limit: boolean
  max_price: number | null
  watch_until_stopped: boolean
  status: SnipeTaskStatus
  check_interval: number
  created_at: string
  updated_at: string
}
