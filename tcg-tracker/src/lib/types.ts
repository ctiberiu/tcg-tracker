export interface Product {
  id: string
  store_name: string
  title: string
  price: number | null
  url: string
  image_url: string | null
  is_notified: boolean
  first_seen: string
}
