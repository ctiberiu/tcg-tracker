import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface PageHeaderProps {
  title: string
  crumbCurrent: string
  meta: ReactNode
}

export function PageHeader({ title, crumbCurrent, meta }: PageHeaderProps) {
  return (
    <div style={{ padding: '36px var(--pr-gutter) 0' }}>
      <div style={{ fontSize: 10.5, color: 'var(--pr-text-dim)', letterSpacing: 1.5, marginBottom: 14 }}>
        <Link to="/" style={{ color: 'var(--pr-text-dim)' }}>← RADAR FLOOR</Link>{' '}
        <span style={{ color: 'var(--pr-border)' }}>/</span>{' '}
        <span style={{ color: 'var(--pr-signal)' }}>{crumbCurrent}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span
          style={{
            fontFamily: 'var(--pr-font-display)',
            fontWeight: 700,
            fontSize: 38,
            color: 'var(--pr-text-bright)',
            letterSpacing: -0.5,
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: 11, color: 'var(--pr-signal)', letterSpacing: 1 }}>● RADAR IS LIVE</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--pr-text-dim)', marginBottom: 28, letterSpacing: 0.5 }}>
        {meta}
      </div>
    </div>
  )
}
