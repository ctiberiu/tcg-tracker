import { StatusDot } from './StatusDot'

interface SweepPanelStore {
  name: string
  signals: number
  last: string
}

interface SweepPanelProps {
  stores: SweepPanelStore[]
  footerLine: string
}

export function SweepPanel({ stores, footerLine }: SweepPanelProps) {
  return (
    <div style={{ border: '1px solid var(--pr-border)', background: 'var(--pr-bg-panel)', padding: 22 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10.5,
          color: 'var(--pr-text-dim)',
          letterSpacing: 1.5,
          marginBottom: 16,
        }}
      >
        <span>STORE SWEEP</span>
        <span style={{ color: 'var(--pr-signal)' }}>● LIVE</span>
      </div>
      <div style={{ display: 'grid', gap: 1, background: 'var(--pr-border)', border: '1px solid var(--pr-border)' }}>
        {stores.map((st) => (
          <div
            key={st.name}
            style={{
              display: 'grid',
              gridTemplateColumns: '14px 1fr auto auto',
              gap: 12,
              alignItems: 'center',
              background: 'var(--pr-bg-panel)',
              padding: '12px 14px',
            }}
          >
            <StatusDot color="var(--pr-signal)" pulse />
            <span style={{ fontSize: 12.5, color: 'var(--pr-text-bright)', fontWeight: 600 }}>{st.name}</span>
            <span style={{ fontSize: 11, color: 'var(--pr-text-dim)' }}>{st.signals} signals</span>
            <span style={{ fontSize: 11, color: 'var(--pr-signal)' }}>{st.last}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--pr-text-dim)', letterSpacing: 1, marginTop: 14 }}>
        {footerLine}
      </div>
    </div>
  )
}
