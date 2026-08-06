import type { CSSProperties } from 'react'

export const ACCENT_HEX = '#2EE86C'

export const dropdownTypeaheadStyle: CSSProperties = {
  flex: 'none',
  padding: '10px 12px',
  background: 'var(--pr-popover-bg)',
  color: 'var(--pr-text-mid)',
  fontSize: 12,
  fontFamily: 'var(--pr-font-mono)',
  border: 'none',
  borderBottom: '1px solid var(--pr-border)',
  outline: 'none',
  letterSpacing: 0.3,
}

export const dropdownRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '10px 12px',
  minHeight: 40,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--pr-font-mono)',
  textAlign: 'left',
}

export const priceInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '9px 10px',
  background: 'var(--pr-bg)',
  color: 'var(--pr-text-mid)',
  fontSize: 12,
  fontFamily: 'var(--pr-font-mono)',
  border: '1px solid var(--pr-border)',
  outline: 'none',
}

export const sectionLabelStyle: CSSProperties = {
  fontSize: 9.5,
  color: 'var(--pr-text-dim)',
  letterSpacing: 2,
  textTransform: 'uppercase',
}

// Screen-reader-only: visually hidden but still announced (aria-live regions,
// decorative-icon replacements that still need a text alternative, etc).
export const visuallyHiddenStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

export interface PricePreset {
  label: string
  min: string
  max: string
}

export const PRICE_PRESETS: PricePreset[] = [
  { label: '< 50', min: '', max: '50' },
  { label: '50–150', min: '50', max: '150' },
  { label: '150–500', min: '150', max: '500' },
  { label: '500+', min: '500', max: '' },
]

export function formatPriceRange(minPrice: string, maxPrice: string): string {
  return `${minPrice || '0'} – ${maxPrice || '∞'} LEI`
}
