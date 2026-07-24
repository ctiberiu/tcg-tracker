import type { ReactNode } from 'react'

interface FilterDropdownPanelProps {
  width: number
  children: ReactNode
}

export function FilterDropdownPanel({ width, children }: FilterDropdownPanelProps) {
  return (
    <div
      className="pr-dropdown-panel"
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        right: 0,
        width,
        maxWidth: 'calc(100vw - 32px)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--pr-popover-bg)',
        border: '1px solid var(--pr-border)',
        zIndex: 60,
      }}
    >
      {children}
    </div>
  )
}
