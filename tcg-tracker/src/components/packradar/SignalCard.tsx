import { useState } from 'react'
import { GameBadge } from './GameBadge'
import { Price } from './Price'
import { StatusBadge } from './StatusBadge'
import type { GameInfo, ProductStatus } from './tokens'

interface SignalCardProps {
  game: GameInfo
  store: string
  date: string
  title: string
  price: number | null
  status: ProductStatus
  imageUrl: string | null
  href: string
}

export function SignalCard({ game, store, date, title, price, status, imageUrl, href }: SignalCardProps) {
  const [hover, setHover] = useState(false)

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        overflow: 'hidden',
        border: `1px solid ${hover ? 'var(--pr-border-hover)' : 'var(--pr-border)'}`,
        background: 'var(--pr-bg-panel)',
        boxShadow: `inset 0 2px 0 ${game.color}`,
      }}
    >
      <div style={{ position: 'relative', height: 200, borderBottom: '1px solid var(--pr-border)', background: '#fff' }}>
        {imageUrl && (
          <img src={imageUrl} alt={title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        )}
        <GameBadge game={game} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, flex: 1 }}>
        <div style={{ fontSize: 10, color: 'var(--pr-text-dim)', letterSpacing: 0.5 }}>
          {store} · {date}
        </div>
        <div
          style={{
            fontFamily: 'var(--pr-font-display)',
            fontSize: 14,
            color: 'var(--pr-text-bright)',
            fontWeight: 600,
            lineHeight: 1.35,
            flex: 1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 8,
            borderTop: '1px solid var(--pr-border)',
          }}
        >
          <Price amount={price} />
          <StatusBadge status={status} />
        </div>
      </div>
    </a>
  )
}
