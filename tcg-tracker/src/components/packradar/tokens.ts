export type GameKey =
  | 'pokemon'
  | 'magic'
  | 'lorcana'
  | 'yugioh'
  | 'digimon'
  | 'one_piece'
  | 'duel_masters'
  | 'dragon_ball_super'
  | 'weiss_schwarz'

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
  digimon: { key: 'digimon', label: 'DIGIMON', color: '#FF6EC7', dim: '#4a2540' },
  one_piece: { key: 'one_piece', label: 'ONE PIECE', color: '#FF5A5A', dim: '#4a2020' },
  duel_masters: { key: 'duel_masters', label: 'DUEL MASTERS', color: '#2DD4BF', dim: '#1a3d38' },
  dragon_ball_super: { key: 'dragon_ball_super', label: 'DRAGON BALL SUPER', color: '#F5A623', dim: '#4a3510' },
  weiss_schwarz: { key: 'weiss_schwarz', label: 'WEISS SCHWARZ', color: '#E5E5E5', dim: '#3a3a3a' },
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
