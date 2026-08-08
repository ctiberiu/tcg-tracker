import type { CSSProperties, ReactNode } from 'react'
import { StatusDot } from './StatusDot'

interface SweepPanelStore {
  name: string
  signals: number
  last: string
}

interface SweepPanelProps {
  stores: SweepPanelStore[]
  footerLine: string
  /**
   * While true, render placeholder rows instead of `stores` and hold the footer
   * line back. Both matter. With an empty store list this panel collapsed to its
   * own padding and let the hero's right column jump on load; and `footerLine`
   * is derived from a `healthy` flag that is false before any store has been
   * read, so a cold load announced "SOME STORES DEGRADED" about stores it had
   * not yet heard from — a claim, not a placeholder.
   */
  loading?: boolean
}

/** RadarFloorPage renders `.slice(0, 6)`, so six rows is what the panel settles on. */
const SKELETON_ROWS = 6

/** Shared so a placeholder row and a real row cannot drift apart in height. */
const ROW_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '14px 1fr auto auto',
  gap: 12,
  alignItems: 'center',
  background: 'var(--pr-bg-panel)',
  padding: '12px 14px',
}

function SweepRow({ children }: { children: ReactNode }) {
  return <div style={ROW_STYLE}>{children}</div>
}

export function SweepPanel({ stores, footerLine, loading = false }: SweepPanelProps) {
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
        {/* "● LIVE" is about the radar, not about the fetch, so it stays put
            while the rows load — it is the one thing on this panel that is true
            before the data arrives. */}
        <span style={{ color: 'var(--pr-signal)' }}>● LIVE</span>
      </div>
      <div style={{ display: 'grid', gap: 1, background: 'var(--pr-border)', border: '1px solid var(--pr-border)' }}>
        {loading
          ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <SweepRow key={`skeleton-${i}`}>
                {/* The dot is drawn unfilled rather than pulsing: a pulsing green
                    dot per row reads as "this store is responding", which is the
                    one thing not yet known. */}
                {/* No bar has a pixel height, for the reason SignalRowSkeleton
                    documents: a hardcoded height is a second copy of a value the
                    real row derives from its font, and the two drift. This version
                    did hardcode 13 and 11 against real text at 12.5 and 11, which
                    left the panel 39px short and shifted the hero grid on load.
                    Each cell now renders U+00A0 at the SAME font size as the cell
                    it stands in for, so the row height is computed the same way in
                    both states and tracks any future font change for free. */}
                <span className="pr-shimmer" style={{ height: 8, width: 8, borderRadius: '50%' }} />
                <span className="pr-shimmer" style={{ fontSize: 12.5, fontWeight: 600, width: `${52 + ((i * 13) % 26)}%` }}>&nbsp;</span>
                <span className="pr-shimmer" style={{ fontSize: 11, width: 58 }}>&nbsp;</span>
                <span className="pr-shimmer" style={{ fontSize: 11, width: 44 }}>&nbsp;</span>
              </SweepRow>
            ))
          : stores.map((st) => (
              <SweepRow key={st.name}>
                <StatusDot color="var(--pr-signal)" pulse />
                <span style={{ fontSize: 12.5, color: 'var(--pr-text-bright)', fontWeight: 600 }}>{st.name}</span>
                <span style={{ fontSize: 11, color: 'var(--pr-text-dim)' }}>{st.signals} signals</span>
                <span style={{ fontSize: 11, color: 'var(--pr-signal)' }}>{st.last}</span>
              </SweepRow>
            ))}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--pr-text-dim)', letterSpacing: 1, marginTop: 14 }}>
        {loading ? <span className="pr-shimmer" style={{ display: 'block', height: 11, width: '68%' }} /> : footerLine}
      </div>
    </div>
  )
}
