import { useState, type CSSProperties } from 'react'
import { ChannelChip } from './ChannelChip'
import { GAMES, type GameInfo } from './tokens'

const fieldStyle: CSSProperties = {
  padding: '11px 14px',
  background: 'var(--pr-bg)',
  color: 'var(--pr-text-mid)',
  fontSize: 12,
  border: '1px solid var(--pr-border)',
  letterSpacing: 0.5,
  fontFamily: 'var(--pr-font-mono)',
  outline: 'none',
}

interface FilterRackProps {
  search: string
  onSearchChange: (value: string) => void
  store: string
  onStoreChange: (value: string) => void
  storeOptions: string[]
  minPrice: string
  onMinPriceChange: (value: string) => void
  maxPrice: string
  onMaxPriceChange: (value: string) => void
  channels: { game: GameInfo; count: number }[]
}

export function FilterRack({
  search,
  onSearchChange,
  store,
  onStoreChange,
  storeOptions,
  minPrice,
  onMinPriceChange,
  maxPrice,
  onMaxPriceChange,
  channels,
}: FilterRackProps) {
  const [showMore, setShowMore] = useState(false)

  return (
    <div style={{ border: '1px solid var(--pr-border)', background: 'var(--pr-bg-panel)', padding: 16 }}>
      <div style={{ fontSize: 9.5, color: 'var(--pr-text-dim)', letterSpacing: 2, marginBottom: 12 }}>
        FILTER RACK
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="SEARCH SIGNALS…"
          style={{ ...fieldStyle, flex: 1, minWidth: 240 }}
        />
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="pr-filters-toggle"
          style={{ ...fieldStyle, cursor: 'pointer', minHeight: 44 }}
        >
          FILTERS {showMore ? '▴' : '▾'}
        </button>
      </div>
      <div className={`pr-filter-extra${showMore ? ' pr-filter-extra--open' : ''}`}>
        <select
          value={store}
          onChange={(e) => onStoreChange(e.target.value)}
          style={{ ...fieldStyle, color: store ? 'var(--pr-text-mid)' : 'var(--pr-text-mid)' }}
        >
          <option value="">STORE: ALL</option>
          {storeOptions.map((name) => (
            <option key={name} value={name}>{name.toUpperCase()}</option>
          ))}
        </select>
        <input
          type="number"
          value={minPrice}
          onChange={(e) => onMinPriceChange(e.target.value)}
          placeholder="MIN 0 LEI"
          style={{ ...fieldStyle, width: 130 }}
        />
        <input
          type="number"
          value={maxPrice}
          onChange={(e) => onMaxPriceChange(e.target.value)}
          placeholder="MAX 500 LEI"
          style={{ ...fieldStyle, width: 140 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 9.5, color: 'var(--pr-text-dim)', letterSpacing: 2, marginRight: 6 }}>
          CHANNEL
        </span>
        <ChannelChip game={GAMES.pokemon} active />
        {channels.map(({ game, count }) => (
          <ChannelChip key={game.key} game={game} count={count} size="md" />
        ))}
      </div>
    </div>
  )
}
