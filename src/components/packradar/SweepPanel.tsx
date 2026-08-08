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
                    one thing not yet known. StatusDot's own 8px box, so the
                    column is the same width. */}
                <span className="pr-shimmer" style={{ height: 8, width: 8, borderRadius: '50%' }} />
                {/* NBSP at each real cell's font size, so the line boxes — and
                    therefore the row height — are identical by construction. The
                    store name at 12.5px is the tallest cell and sets the row:
                    18.75 + 24px padding = 42.75px. Pixel heights here were 13px
                    and cost 5.75px per row, 39px across the panel. */}
                <span className="pr-shimmer" style={{ display: 'block', fontSize: 12.5, fontWeight: 600, width: `${52 + ((i * 13) % 26)}%` }}>
                  {'\u00A0'}
                </span>
                <span className="pr-shimmer" style={{ display: 'block', fontSize: 11, width: 58 }}>
                  {'\u00A0'}
                </span>
                <span className="pr-shimmer" style={{ display: 'block', fontSize: 11, width: 44 }}>
                  {'\u00A0'}
                </span>
              </SweepRow>
            ))
          : stores.map((st) => (
              <SweepRow key={st.name}>
                <StatusDot color="var(--pr-signal)" pulse />
                {/* One line, always — the same treatment SignalRow's title got in
                    f3178d3, and for the same reason. Store names run from "Foon"
                    to "Hobby-Planet (Magic: The Gathering)", and in the `1fr`
                    column at 390px the long ones wrapped: measured one row at
                    61.5px against 42.75px, i.e. 18.75px of layout shift that no
                    skeleton can predict because it depends on which stores swept
                    most recently. `minWidth: 0` is the part that actually does the
                    work — a grid item's default `min-width: auto` refuses to
                    shrink below its content and the ellipsis never engages. */}
                <span
                  title={st.name}
                  style={{
                    fontSize: 12.5,
                    color: 'var(--pr-text-bright)',
                    fontWeight: 600,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {st.name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--pr-text-dim)' }}>{st.signals} signals</span>
                <span style={{ fontSize: 11, color: 'var(--pr-signal)' }}>{st.last}</span>
              </SweepRow>
            ))}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--pr-text-dim)', letterSpacing: 1, marginTop: 14 }}>
        {/* Same trick: the footer's own 10.5px line box (15.75px), not a
            hardcoded 11px, which was costing the panel a further 4.75px. */}
        {loading ? (
          <span className="pr-shimmer" style={{ display: 'block', width: '68%' }}>
            {'\u00A0'}
          </span>
        ) : (
          footerLine
        )}
      </div>
    </div>
  )
}
