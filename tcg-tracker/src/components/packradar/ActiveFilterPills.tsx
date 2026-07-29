import { StatusDot } from './StatusDot'

export interface ActivePill {
  key: string
  label: string
  color: string
  onRemove: () => void
}

interface ActiveFilterPillsProps {
  pills: ActivePill[]
  onClearAll: () => void
}

export function ActiveFilterPills({ pills, onClearAll }: ActiveFilterPillsProps) {
  if (pills.length === 0) return null

  return (
    <div className="pr-active-pills" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 9.5, color: 'var(--pr-text-dim)', letterSpacing: 2, flex: 'none' }}>ACTIVE</span>
      {pills.map((pill) => (
        <button
          key={pill.key}
          type="button"
          onClick={pill.onRemove}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            flex: 'none',
            padding: '6px 10px',
            background: `${pill.color}1a`,
            border: `1px solid ${pill.color}66`,
            color: pill.color,
            fontSize: 11,
            fontFamily: 'var(--pr-font-mono)',
            letterSpacing: 0.5,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <StatusDot color={pill.color} size={6} />
          {pill.label}
          <span style={{ fontWeight: 400 }}>✕</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        style={{
          flex: 'none',
          background: 'none',
          border: 'none',
          color: 'var(--pr-text-dim)',
          fontSize: 11,
          textDecoration: 'underline',
          cursor: 'pointer',
          fontFamily: 'var(--pr-font-mono)',
          letterSpacing: 0.5,
        }}
      >
        clear all
      </button>
    </div>
  )
}
