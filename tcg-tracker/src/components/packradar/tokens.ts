export type GameKey = 'pokemon' | 'magic' | 'lorcana' | 'yugioh'

export interface GameInfo {
  key: GameKey
  label: string
  color: string
  dim: string
}

export const GAMES: Record<GameKey, GameInfo> = {
  pokemon: { key: 'pokemon', label: 'POKÉMON', color: '#FFD447', dim: '#4a4020' },
  magic: { key: 'magic', label: 'MAGIC', color: '#B486FF', dim: '#3a3050' },
  lorcana: { key: 'lorcana', label: 'LORCANA', color: '#4FC3FF', dim: '#20404f' },
  yugioh: { key: 'yugioh', label: 'YU-GI-OH!', color: '#FF8A5C', dim: '#4a3225' },
}

export type ProductStatus = 'IN STOCK' | 'PREORDER' | 'GONE'

export const STATUS_COLOR: Record<ProductStatus, string> = {
  'IN STOCK': '#2EE86C',
  PREORDER: '#FFB020',
  GONE: '#FF4747',
}

export type StoreHealthStatus = 'OK' | 'SLOW' | 'DOWN'

export const STORE_STATUS_COLOR: Record<StoreHealthStatus, string> = {
  OK: '#2EE86C',
  SLOW: '#FFB020',
  DOWN: '#FF4747',
}

export const STORE_STATUS_LABEL: Record<StoreHealthStatus, string> = {
  OK: 'SIGNAL OK',
  SLOW: 'SLOW RESPONSE',
  DOWN: 'NO SIGNAL',
}
