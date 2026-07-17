interface StatusStripProps {
  lastSweepTime: string
  storeCount: number
  healthy: boolean
  healthLabel?: string
}

export function StatusStrip({ lastSweepTime, storeCount, healthy, healthLabel }: StatusStripProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px var(--pr-gutter)',
        borderBottom: '1px solid var(--pr-border)',
        fontSize: 10.5,
        letterSpacing: 1.5,
        color: 'var(--pr-text-dim)',
      }}
    >
      <span>LAST SWEEP {lastSweepTime}</span>
      <span className="pr-status-strip-meta" style={{ display: 'flex', gap: 24 }}>
        <span>{storeCount} STORES</span>
        <span style={{ color: healthy ? 'var(--pr-signal)' : '#FFB020' }}>
          {healthLabel ?? (healthy ? 'SIGNAL OK' : 'DEGRADED')}
        </span>
        <span>RO · EET</span>
      </span>
    </div>
  )
}
