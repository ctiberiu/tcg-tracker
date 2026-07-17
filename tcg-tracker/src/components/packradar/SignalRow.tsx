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
      <span style={{ fontFamily: 'var(--pr-font-display)', fontSize: 14.5, color: 'var(--pr-text-bright)', fontWeight: 600 }}>
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
