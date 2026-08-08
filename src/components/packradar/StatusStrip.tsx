/**
 * The placeholder every page uses for a figure it does not have yet. Shared from
 * here rather than redeclared per page so "unknown" looks the same everywhere;
 * GameLandingPage had the only copy of it.
 */
export const PENDING = '···'

interface StatusStripProps {
  /** Already formatted, or PENDING. Never a fallback like "now" — see RadarFloorPage. */
  lastSweepTime: string
  storeCount: number
  healthy: boolean
  healthLabel?: string
  /**
   * While true, the count and the health word are withheld.
   *
   * Both are derived from an empty array during load and both lie, in opposite
   * directions: `storeCount` is 0, so the strip read "0 STORES" — a claim of no
   * coverage on the page whose pitch is breadth — while `healthy` on /stores is
   * `[].every(...)`, i.e. true, so that page claimed "SIGNAL OK" before it had
   * heard from a single store. Neither is a styling problem; a zero rendered in
   * the same type as a real figure is indistinguishable from data.
   */
  loading?: boolean
}

export function StatusStrip({ lastSweepTime, storeCount, healthy, healthLabel, loading = false }: StatusStripProps) {
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
        <span>{loading ? PENDING : storeCount} STORES</span>
        <span style={{ color: loading ? 'var(--pr-text-dim)' : healthy ? 'var(--pr-signal)' : '#FFB020' }}>
          {loading ? PENDING : (healthLabel ?? (healthy ? 'SIGNAL OK' : 'DEGRADED'))}
        </span>
        <span>RO · EET</span>
      </span>
    </div>
  )
}
