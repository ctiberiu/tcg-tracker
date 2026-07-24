import { FilterDropdownPanel } from './FilterDropdownPanel'
import { PRICE_PRESETS, formatPriceRange, priceInputStyle } from './filterStyles'

interface PriceFilterDropdownProps {
  minPrice: string
  maxPrice: string
  onChange: (min: string, max: string) => void
}

export function PriceFilterDropdown({ minPrice, maxPrice, onChange }: PriceFilterDropdownProps) {
  return (
    <FilterDropdownPanel width={300}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px',
          borderBottom: '1px solid var(--pr-border)',
        }}
      >
        <span style={{ fontSize: 9.5, color: 'var(--pr-text-dim)', letterSpacing: 2 }}>PRICE</span>
        <span style={{ fontSize: 11, color: 'var(--pr-text-bright)', fontWeight: 600 }}>
          {formatPriceRange(minPrice, maxPrice)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 12 }}>
        <input
          type="number"
          value={minPrice}
          onChange={(e) => onChange(e.target.value, maxPrice)}
          placeholder="MIN"
          style={priceInputStyle}
        />
        <input
          type="number"
          value={maxPrice}
          onChange={(e) => onChange(minPrice, e.target.value)}
          placeholder="MAX"
          style={priceInputStyle}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 12px 12px' }}>
        {PRICE_PRESETS.map((preset) => {
          const active = minPrice === preset.min && maxPrice === preset.max
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(preset.min, preset.max)}
              style={{
                padding: '7px 10px',
                fontSize: 10.5,
                fontFamily: 'var(--pr-font-mono)',
                letterSpacing: 0.5,
                background: active ? 'var(--pr-active-bg)' : 'var(--pr-bg)',
                color: active ? 'var(--pr-signal)' : 'var(--pr-text-mid)',
                border: `1px solid ${active ? 'var(--pr-active-border)' : 'var(--pr-border)'}`,
                cursor: 'pointer',
              }}
            >
              {preset.label}
            </button>
          )
        })}
      </div>
    </FilterDropdownPanel>
  )
}
