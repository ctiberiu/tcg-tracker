import { useCallback, useRef } from 'react'
import { FloatingFocusManager, FloatingPortal } from '@floating-ui/react'
import { FilterDropdownButton } from './FilterDropdownButton'
import { FilterDropdownPanel } from './FilterDropdownPanel'
import { PRICE_PRESETS, formatPriceRange, priceInputStyle } from './filterStyles'
import { useFilterDropdown } from './useFilterDropdown'

interface PriceFilterDropdownProps {
  minPrice: string
  maxPrice: string
  onChange: (min: string, max: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PriceFilterDropdown({ minPrice, maxPrice, onChange, open, onOpenChange }: PriceFilterDropdownProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const priceActive = Boolean(minPrice || maxPrice)

  const { refs, floatingStyles, context, getReferenceProps, getFloatingProps, maxHeight } = useFilterDropdown({
    open,
    onOpenChange,
  })

  const setTriggerRef = useCallback(
    (node: HTMLButtonElement | null) => {
      refs.setReference(node)
      triggerRef.current = node
    },
    [refs],
  )

  return (
    <div style={{ position: 'relative' }}>
      <FilterDropdownButton
        ref={setTriggerRef}
        label="PRICE"
        count={priceActive ? 1 : 0}
        aria-haspopup="dialog"
        aria-expanded={open}
        {...getReferenceProps({
          onClick: () => onOpenChange(!open),
        })}
      />
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} returnFocus={triggerRef}>
            <FilterDropdownPanel
              // eslint-disable-next-line react-hooks/refs -- floating-ui callback-ref setter, not a `.current` read
              ref={refs.setFloating}
              width={300}
              maxHeight={maxHeight}
              floatingStyles={floatingStyles}
              aria-label="Price filter"
              {...getFloatingProps()}
            >
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
                  aria-label="Minimum price"
                  style={priceInputStyle}
                />
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => onChange(minPrice, e.target.value)}
                  placeholder="MAX"
                  aria-label="Maximum price"
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
                      aria-pressed={active}
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
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </div>
  )
}
