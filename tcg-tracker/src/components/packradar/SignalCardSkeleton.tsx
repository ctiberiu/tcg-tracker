export function SignalCardSkeleton() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--pr-border)',
        background: 'var(--pr-bg-panel)',
        boxShadow: 'inset 0 2px 0 #16241c',
      }}
    >
      <div className="pr-shimmer" style={{ height: 200, borderBottom: '1px solid var(--pr-border)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, flex: 1 }}>
        <div className="pr-shimmer" style={{ height: 10, width: '55%' }} />
        <div className="pr-shimmer" style={{ height: 14, width: '90%' }} />
        <div className="pr-shimmer" style={{ height: 14, width: '70%', flex: 1 }} />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 8,
            borderTop: '1px solid var(--pr-border)',
          }}
        >
          <div className="pr-shimmer" style={{ height: 14, width: 50 }} />
          <div className="pr-shimmer" style={{ height: 12, width: 64 }} />
        </div>
      </div>
    </div>
  )
}
