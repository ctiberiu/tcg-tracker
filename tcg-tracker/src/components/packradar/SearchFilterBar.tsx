import { useState, type CSSProperties } from 'react'
import { GAMES, type GameInfo, type GameKey } from './tokens'
import { FilterDropdownButton } from './FilterDropdownButton'
import { ChannelFilterDropdown } from './ChannelFilterDropdown'
import { StoreFilterDropdown } from './StoreFilterDropdown'
import { PriceFilterDropdown } from './PriceFilterDropdown'
import { ActiveFilterPills, type ActivePill } from './ActiveFilterPills'
import { MobileFilterSheet } from './MobileFilterSheet'
import { ACCENT_HEX, formatPriceRange } from './filterStyles'

type OpenMenu = 'channel' | 'store' | 'price' | null

interface SearchFilterBarProps {
  search: string
  onSearchChange: (value: string) => void
  channels: { game: GameInfo; count: number }[]
  selectedChannels: GameKey[]
  onChannelsChange: (keys: GameKey[]) => void
  stores: { name: string; count: number }[]
  selectedStores: string[]
  onStoresChange: (names: string[]) => void
  minPrice: string
  maxPrice: string
  onPriceChange: (min: string, max: string) => void
  resultCount: number
}

const searchInputStyle: CSSProperties = {
  padding: '11px 14px',
  minHeight: 44,
  background: 'var(--pr-bg-panel)',
  color: 'var(--pr-text-mid)',
  fontSize: 12,
  fontFamily: 'var(--pr-font-mono)',
  letterSpacing: 0.5,
  border: '1px solid var(--pr-border)',
  outline: 'none',
  width: '100%',
}

export function SearchFilterBar({
  search,
  onSearchChange,
  channels,
  selectedChannels,
  onChannelsChange,
  stores,
  selectedStores,
  onStoresChange,
  minPrice,
  maxPrice,
  onPriceChange,
  resultCount,
}: SearchFilterBarProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const toggleChannel = (key: GameKey) => {
    onChannelsChange(selectedChannels.includes(key) ? selectedChannels.filter((k) => k !== key) : [...selectedChannels, key])
  }

  const toggleStore = (name: string) => {
    onStoresChange(selectedStores.includes(name) ? selectedStores.filter((n) => n !== name) : [...selectedStores, name])
  }

  const clearAll = () => {
    onSearchChange('')
    onChannelsChange([])
    onStoresChange([])
    onPriceChange('', '')
  }

  const priceActive = Boolean(minPrice || maxPrice)

  const pills: ActivePill[] = [
    ...selectedChannels.map((key) => {
      const game = GAMES[key]
      return { key: `channel-${key}`, label: game.label, color: game.color, onRemove: () => toggleChannel(key) }
    }),
    ...selectedStores.map((name) => ({
      key: `store-${name}`,
      label: name.toUpperCase(),
      color: ACCENT_HEX,
      onRemove: () => toggleStore(name),
    })),
    ...(priceActive
      ? [{ key: 'price', label: formatPriceRange(minPrice, maxPrice), color: ACCENT_HEX, onRemove: () => onPriceChange('', '') }]
      : []),
  ]

  return (
    <div>
      <div className="pr-searchbar">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="SEARCH SIGNALS…"
          className="pr-searchbar-search-input"
          style={searchInputStyle}
        />

        <div className="pr-searchbar-buttons">
          <div style={{ position: 'relative' }}>
            <FilterDropdownButton
              label="CHANNEL"
              count={selectedChannels.length}
              open={openMenu === 'channel'}
              onClick={() => setOpenMenu((m) => (m === 'channel' ? null : 'channel'))}
            />
            {openMenu === 'channel' && (
              <ChannelFilterDropdown channels={channels} selected={selectedChannels} onToggle={toggleChannel} />
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <FilterDropdownButton
              label="STORE"
              count={selectedStores.length}
              open={openMenu === 'store'}
              onClick={() => setOpenMenu((m) => (m === 'store' ? null : 'store'))}
            />
            {openMenu === 'store' && (
              <StoreFilterDropdown stores={stores} selected={selectedStores} onToggle={toggleStore} />
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <FilterDropdownButton
              label="PRICE"
              count={priceActive ? 1 : 0}
              open={openMenu === 'price'}
              onClick={() => setOpenMenu((m) => (m === 'price' ? null : 'price'))}
            />
            {openMenu === 'price' && (
              <PriceFilterDropdown minPrice={minPrice} maxPrice={maxPrice} onChange={onPriceChange} />
            )}
          </div>
        </div>

        <button type="button" className="pr-filters-trigger" onClick={() => setSheetOpen(true)}>
          FILTERS{pills.length > 0 ? ` · ${pills.length}` : ''} ▾
        </button>
      </div>

      <ActiveFilterPills pills={pills} onClearAll={clearAll} />

      {openMenu && <div className="pr-dropdown-backdrop" onClick={() => setOpenMenu(null)} />}

      {sheetOpen && (
        <MobileFilterSheet
          channels={channels}
          selectedChannels={selectedChannels}
          onToggleChannel={toggleChannel}
          stores={stores}
          selectedStores={selectedStores}
          onToggleStore={toggleStore}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onPriceChange={onPriceChange}
          onClear={clearAll}
          resultCount={resultCount}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  )
}
