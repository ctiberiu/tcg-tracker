import type { CSSProperties } from 'react'

/**
 * Loading placeholder for SignalRow.
 *
 * The homepage renders rows, not cards, so SignalCardSkeleton does not fit — but
 * a second skeleton in a different visual language would be worse than none, so
 * this borrows that component's whole vocabulary: the same `pr-shimmer` bars,
 * the same border, no new colours and no new animation.
 *
 * ── Why the cells carry font sizes and a non-breaking space ──────────────────
 * The height has to match SignalRow's at every width, and the first version of
 * this hardcoded bar heights in pixels. That was wrong twice: 6px short per row
 * at 1400px, and 25px short per row at 390px, where `.pr-signal-row`'s
 * `!important` mobile rule stacks the six columns into six lines and every
 * error multiplies by six.
 *
 * So no bar has a pixel height. Each cell renders U+00A0 at the SAME font size
 * and family as the text it stands in for, which makes its line box identical by
 * construction — at any viewport, with any font, including while a webfont is
 * still swapping. `.pr-shimmer` paints the span's background, so the line box is
 * the bar. The row cannot drift from SignalRow unless the fonts themselves do.
 *
 * The grid, the class and the padding are SignalRow's own, for the same reason:
 * the mobile breakpoint lives in `.pr-signal-row` and must not be duplicated.
 */

/** Mirrors the corresponding span in SignalRow. Keep the two in step. */
const CELL: Record<'date' | 'store' | 'game' | 'title' | 'price' | 'status', CSSProperties> = {
  date: { fontSize: 11, width: 62 },
  store: { fontSize: 11, width: 78 },
  game: { fontSize: 11, width: 88 },
  // SignalRow's title is the display face at 14.5/600 and is the tallest cell,
  // so it sets the row height on desktop.
  title: { fontFamily: 'var(--pr-font-display)', fontSize: 14.5, fontWeight: 600, width: '72%' },
  price: { fontSize: 13, fontWeight: 700, width: 66, marginLeft: 'auto' },
  status: { fontSize: 10, width: 58, marginLeft: 'auto' },
}

export function SignalRowSkeleton() {
  return (
    <div
      className="pr-signal-row"
      aria-hidden="true"
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 110px 110px 1fr 110px 100px',
        gap: 16,
        alignItems: 'center',
        padding: '14px 0 14px 14px',
        borderBottom: '1px solid var(--pr-border)',
        // SignalRow draws a game-coloured left edge here. The game is unknown
        // until the row loads, so the same 2px inset is held in the neutral
        // border colour — the strip gains its colour rather than appearing.
        boxShadow: 'inset 2px 0 0 var(--pr-border)',
      }}
    >
      {Object.entries(CELL).map(([key, style]) => (
        <span key={key} className="pr-shimmer" style={{ display: 'block', ...style }}>
          {/* A non-breaking space. A plain one collapses, and the line box
              collapses with it — that line box is the whole mechanism here. */}
          {'\u00A0'}
        </span>
      ))}
    </div>
  )
}
