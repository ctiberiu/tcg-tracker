import type { ReactNode } from 'react'
import { InfoTooltip } from './InfoTooltip'

interface StatCellProps {
  label: string
  value: ReactNode
  bordered?: boolean
  tooltip?: string
}

export function StatCell({ label, value, bordered = true, tooltip }: StatCellProps) {
  return (
    <div
      style={{
        padding: '14px 18px',
        borderRight: bordered ? '1px solid var(--pr-border)' : undefined,
      }}
    >
      <div style={{ fontSize: 9, color: 'var(--pr-text-dim)', letterSpacing: 2, marginBottom: 6, display: 'flex', alignItems: 'center' }}>
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div style={{ fontFamily: 'var(--pr-font-display)', fontSize: 22, fontWeight: 700, color: 'var(--pr-text-bright)' }}>
        {value}
      </div>
    </div>
  )
}
