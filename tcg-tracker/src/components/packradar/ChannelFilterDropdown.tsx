import { useMemo, useState } from 'react'
import type { GameInfo, GameKey } from './tokens'
import { FilterCheckbox } from './FilterCheckbox'
import { FilterDropdownPanel } from './FilterDropdownPanel'
import { StatusDot } from './StatusDot'
import { dropdownRowStyle, dropdownTypeaheadStyle } from './filterStyles'

interface ChannelFilterDropdownProps {
  channels: { game: GameInfo; count: number }[]
  selected: GameKey[]
  onToggle: (key: GameKey) => void
}

export function ChannelFilterDropdown({ channels, selected, onToggle }: ChannelFilterDropdownProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return channels
    return channels.filter(({ game }) => game.label.toLowerCase().includes(q))
  }, [channels, query])

  return (
    <FilterDropdownPanel width={300}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter channels…"
        style={dropdownTypeaheadStyle}
      />
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {filtered.map(({ game, count }) => {
          const checked = selected.includes(game.key)
          return (
            <button
              key={game.key}
              type="button"
              onClick={() => onToggle(game.key)}
              className="pr-dropdown-row"
              style={{ ...dropdownRowStyle, background: checked ? '#ffffff08' : 'transparent' }}
            >
              <FilterCheckbox checked={checked} color={game.color} />
              <StatusDot color={game.color} size={7} />
              <span
                style={{
                  flex: 1,
                  color: game.color,
                  fontSize: 11,
                  letterSpacing: 0.5,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                {game.label}
              </span>
              <span style={{ color: 'var(--pr-text-dim)', fontSize: 11 }}>{count}</span>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ padding: '14px 12px', color: 'var(--pr-text-dim)', fontSize: 11 }}>No channels match.</div>
        )}
      </div>
    </FilterDropdownPanel>
  )
}
