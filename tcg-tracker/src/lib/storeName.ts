/**
 * A single physical store gets one `stores` row per game it's scraped for
 * (e.g. "RedGoblin" for Pokémon, "RedGoblin (One Piece)" for One Piece —
 * see migrations 025/026). This strips that disambiguating suffix so the
 * store filter can treat them as one store, narrowed further by the
 * channel/game filter instead.
 */
export function getStoreBaseName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim()
}
