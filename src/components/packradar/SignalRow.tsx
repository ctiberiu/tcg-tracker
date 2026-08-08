import { StatusDot } from './StatusDot'
import { Price } from './Price'
import type { GameInfo, ProductStatus } from './tokens'
import { STATUS_COLOR } from './tokens'

interface SignalRowProps {
  game: GameInfo
  date: string
  store: string
  title: string
  price: number | null
  status: ProductStatus
  href: string
}

export function SignalRow({ game, date, store, title, price, status, href }: SignalRowProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="pr-signal-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 110px 110px 1fr 110px 100px',
        gap: 16,
        alignItems: 'center',
        padding: '14px 0 14px 14px',
        borderBottom: '1px solid var(--pr-border)',
        boxShadow: `inset 2px 0 0 ${game.color}`,
        color: 'inherit',
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--pr-text-dim)' }}>{date}</span>
      <span style={{ fontSize: 11, color: 'var(--pr-text-mid)', letterSpacing: 0.5 }}>{store}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: game.color, fontWeight: 600 }}>
        <StatusDot color={game.color} size={7} />
        {game.label}
      </span>
      {/* One line, always. Product titles vary wildly in length — "Pokemon TCG -
          PITCH BLACK - 3-pack Blister" against "Magic: The Gathering Marvel Super
          Heroes - The Fantastic Four Collector's Edition Commander Deck" — so an
          unconstrained title wrapped to two lines on roughly half the rows and the
          row grew from 53px to 73px. That made the height a function of the data,
          which no fixed-height skeleton can match: measured a 73px layout shift on
          load. Truncating pins the row so the skeleton is exact rather than
          approximate, and stays exact as content changes. The full title is on
          /view and in the `title` attribute below. */}
      <span
        title={title}
        style={{
          fontFamily: 'var(--pr-font-display)',
          fontSize: 14.5,
          color: 'var(--pr-text-bright)',
          fontWeight: 600,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </span>
      <span style={{ textAlign: 'right' }}>
        <Price amount={price} size={13} />
      </span>
      <span style={{ fontSize: 10, color: STATUS_COLOR[status], fontWeight: 700, letterSpacing: 1, textAlign: 'right' }}>
        ● {status}
      </span>
    </a>
  )
}
