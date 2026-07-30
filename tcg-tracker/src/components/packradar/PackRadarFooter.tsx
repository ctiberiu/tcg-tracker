export function PackRadarFooter() {
  return (
    <div
      className="pr-footer"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 36,
        padding: '18px var(--pr-gutter)',
        borderTop: '1px solid var(--pr-border)',
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--pr-text-dim)', letterSpacing: 1 }}>
        NO NEW SIGNALS. RADAR IS LIVE.
      </span>
      <span style={{ fontSize: 11, color: 'var(--pr-text-dim)', letterSpacing: 1 }}>
        PACKRADAR · RO SWEEP · 2026
      </span>
    </div>
  )
}
