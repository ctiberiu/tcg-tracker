import { useEffect, useMemo, useState } from 'react'
import type { GameInfo, GameKey } from './tokens'
import { FilterCheckbox } from './FilterCheckbox'
import { StatusDot } from './StatusDot'
import { PRICE_PRESETS, dropdownRowStyle, formatPriceRange, priceInputStyle, sectionLabelStyle } from './filterStyles'

// Keep in sync with the transition duration on .pr-filter-sheet in packradar.css.
const TRANSITION_MS = 260

interface MobileFilterSheetProps {
  open: boolean
  channels: { game: GameInfo; count: number }[]
  selectedChannels: GameKey[]
  onToggleChannel: (key: GameKey) => void
  stores: { name: string; count: number }[]
  selectedStores: string[]
  onToggleStore: (name: string) => void
  minPrice: string
  maxPrice: string
  onPriceChange: (min: string, max: string) => void
  onClear: () => void
  resultCount: number
  onClose: () => void
}

export function MobileFilterSheet({
  open,
  channels,
  selectedChannels,
  onToggleChannel,
  stores,
  selectedStores,
  onToggleStore,
  minPrice,
  maxPrice,
  onPriceChange,
  onClear,
  resultCount,
  onClose,
}: MobileFilterSheetProps) {
  const [storeQuery, setStoreQuery] = useState('')
  // Stays mounted for TRANSITION_MS after `open` goes false, so the close
  // animation can play instead of the sheet vanishing instantly.
  const [rendered, setRendered] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      // Mount-then-animate: `rendered` must flip synchronously so the sheet is in
      // the DOM (at its hidden transform) before the next frame reveals it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRendered(true)
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
  }, [open])

  useEffect(() => {
    if (open || !rendered) return
    const timeout = setTimeout(() => setRendered(false), TRANSITION_MS)
    return () => clearTimeout(timeout)
  }, [open, rendered])

  // Block the page behind the sheet from scrolling for as long as it's
  // shown or animating out.
  useEffect(() => {
    if (!rendered) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [rendered])

  const filteredStores = useMemo(() => {
    const q = storeQuery.trim().toLowerCase()
    if (!q) return stores
    return stores.filter((s) => s.name.toLowerCase().includes(q))
  }, [stores, storeQuery])

  if (!rendered) return null

  return (
    <div
      className="pr-filter-sheet"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'var(--pr-popover-bg)',
        display: 'flex',
        flexDirection: 'column',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--pr-border)',
          flex: 'none',
        }}
      >
        <span style={{ fontFamily: 'var(--pr-font-display)', fontWeight: 700, fontSize: 19, color: 'var(--pr-text-bright)' }}>
          Filters
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filters"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--pr-text-mid)',
            fontSize: 18,
            cursor: 'pointer',
            minWidth: 44,
            minHeight: 44,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '20px 20px 0' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>Channel</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {channels.map(({ game, count }) => {
              const checked = selectedChannels.includes(game.key)
              return (
                <button
                  key={game.key}
                  type="button"
                  onClick={() => onToggleChannel(game.key)}
                  style={{ ...dropdownRowStyle, minHeight: 44, background: checked ? '#ffffff08' : 'transparent' }}
                >
                  <FilterCheckbox checked={checked} color={game.color} />
                  <StatusDot color={game.color} size={7} />
                  <span
                    style={{
                      flex: 1,
                      color: game.color,
                      fontSize: 12,
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
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>Store</div>
          <input
            type="text"
            value={storeQuery}
            onChange={(e) => setStoreQuery(e.target.value)}
            placeholder={`Search ${stores.length} stores…`}
            style={{ ...priceInputStyle, width: '100%', minHeight: 44, marginBottom: 8 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 240, overflowY: 'auto' }}>
            {filteredStores.map(({ name, count }) => {
              const checked = selectedStores.includes(name)
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onToggleStore(name)}
                  style={{ ...dropdownRowStyle, minHeight: 44, background: checked ? '#ffffff08' : 'transparent' }}
                >
                  <FilterCheckbox checked={checked} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      color: 'var(--pr-text-bright)',
                      fontSize: 12,
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
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span style={sectionLabelStyle}>Price</span>
            <span style={{ fontSize: 11, color: 'var(--pr-text-bright)', fontWeight: 600 }}>
              {formatPriceRange(minPrice, maxPrice)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              type="number"
              value={minPrice}
              onChange={(e) => onPriceChange(e.target.value, maxPrice)}
              placeholder="MIN"
              style={{ ...priceInputStyle, minHeight: 44 }}
            />
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => onPriceChange(minPrice, e.target.value)}
              placeholder="MAX"
              style={{ ...priceInputStyle, minHeight: 44 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRICE_PRESETS.map((preset) => {
              const active = minPrice === preset.min && maxPrice === preset.max
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onPriceChange(preset.min, preset.max)}
                  style={{
                    padding: '9px 12px',
                    minHeight: 40,
                    fontSize: 11,
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
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, padding: 16, borderTop: '1px solid var(--pr-border)', flex: 'none' }}>
        <button
          type="button"
          onClick={onClear}
          style={{
            flex: 1,
            minHeight: 44,
            background: 'transparent',
            border: '1px solid var(--pr-border)',
            color: 'var(--pr-text-mid)',
            fontFamily: 'var(--pr-font-mono)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 2,
            minHeight: 44,
            background: 'var(--pr-signal)',
            border: 'none',
            color: 'var(--pr-bg)',
            fontFamily: 'var(--pr-font-mono)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Show {resultCount} Signals
        </button>
      </div>
    </div>
  )
}
