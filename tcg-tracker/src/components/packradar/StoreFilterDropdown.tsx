import { useMemo, useState } from 'react'
import { FilterCheckbox } from './FilterCheckbox'
import { FilterDropdownPanel } from './FilterDropdownPanel'
import { dropdownRowStyle, dropdownTypeaheadStyle } from './filterStyles'

interface StoreFilterDropdownProps {
  stores: { name: string; count: number }[]
  selected: string[]
  onToggle: (name: string) => void
}

export function StoreFilterDropdown({ stores, selected, onToggle }: StoreFilterDropdownProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return stores
    return stores.filter((s) => s.name.toLowerCase().includes(q))
  }, [stores, query])

  return (
    <FilterDropdownPanel width={280}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${stores.length} stores…`}
        style={dropdownTypeaheadStyle}
      />
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {filtered.map(({ name, count }) => {
          const checked = selected.includes(name)
          return (
            <button
              key={name}
              type="button"
              onClick={() => onToggle(name)}
              className="pr-dropdown-row"
              style={{ ...dropdownRowStyle, background: checked ? '#ffffff08' : 'transparent' }}
            >
              <FilterCheckbox checked={checked} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: 'var(--pr-text-bright)',
                  fontSize: 11,
                  letterSpacing: 0.5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {name.toUpperCase()}
              </span>
              <span style={{ color: 'var(--pr-text-dim)', fontSize: 11, flex: 'none' }}>{count}</span>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ padding: '14px 12px', color: 'var(--pr-text-dim)', fontSize: 11 }}>No stores match.</div>
        )}
      </div>
    </FilterDropdownPanel>
  )
}
