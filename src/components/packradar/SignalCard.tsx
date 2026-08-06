import { useState } from 'react'
import { track } from '@vercel/analytics'
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
  /** Overrides the badge text without touching the status the colour comes
   *  from — see StatusBadge. Used by the Romanian landing pages. */
  statusLabel?: string
}

export function SignalCard({ game, store, date, title, price, status, imageUrl, href, statusLabel }: SignalCardProps) {
  const [hover, setHover] = useState(false)

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      // The only measure of whether this product actually works: someone saw a
      // restock and left for the store to buy it. Fired on click rather than via
      // a beforeunload/sendBeacon dance because target="_blank" keeps this page
      // alive, so the request is not racing a navigation.
      //
      // Deliberately carries no product title or URL — those are free-text and
      // would put arbitrary strings into analytics. Store, game and status are
      // low-cardinality and are what the questions are actually about ("which
      // stores convert", "which games do people click"). Nothing here is
      // personal data, so this stays consent-free.
      onClick={() => {
        track('outbound_click', { store, game: game.key, status })
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        overflow: 'hidden',
        border: `1px solid ${game.color}`,
        background: 'var(--pr-bg-panel)',
        boxShadow: hover ? `0 0 10px ${game.color}4d, inset 0 2px 0 ${game.color}` : `inset 0 2px 0 ${game.color}`,
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
          <StatusBadge status={status} label={statusLabel} />
        </div>
      </div>
    </a>
  )
}
