import { useState } from 'react'
import { Link } from 'react-router-dom'
import { StatusDot } from './StatusDot'
import { StatCell } from './StatCell'
import { ChannelChip } from './ChannelChip'
import type { GameInfo, StoreHealthStatus } from './tokens'
import { STORE_STATUS_COLOR, STORE_STATUS_LABEL } from './tokens'

interface StoreCardProps {
  name: string
  domain: string
  status: StoreHealthStatus
  signals7d: number
  lastSweep: string
  lastSignal: string
  inStockCount: number
  channels: GameInfo[]
  latest: string
  viewSignalsHref: string
}

export function StoreCard({ name, domain, status, signals7d, lastSweep, lastSignal, inStockCount, channels, latest, viewSignalsHref }: StoreCardProps) {
  const [hover, setHover] = useState(false)
  const statusColor = STORE_STATUS_COLOR[status]

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        border: `1px solid ${hover ? 'var(--pr-border-hover)' : 'var(--pr-border)'}`,
        background: 'var(--pr-bg-panel)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 18px',
          borderBottom: '1px solid var(--pr-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <StatusDot color={statusColor} size={10} pulse />
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
            alt=""
            width={16}
            height={16}
            style={{ flexShrink: 0 }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
          <span
            style={{
              fontFamily: 'var(--pr-font-display)',
              fontWeight: 700,
              fontSize: 19,
              color: 'var(--pr-text-bright)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {name}
          </span>
          <span className="pr-store-domain" style={{ fontSize: 10, color: 'var(--pr-text-dim)', letterSpacing: 1, whiteSpace: 'nowrap', flex: 'none' }}>
            {domain}
          </span>
        </div>
        <span style={{ fontSize: 9.5, color: statusColor, fontWeight: 700, letterSpacing: 1.5, flex: 'none' }}>
          ● {STORE_STATUS_LABEL[status]}
        </span>
      </div>

      <div className="pr-store-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--pr-border)' }}>
        <StatCell
          label="SIGNALS 7D"
          value={signals7d}
          tooltip="New products detected at this store in the last 7 days."
        />
        <StatCell
          label="LAST SWEEP"
          value={lastSweep}
          tooltip="Time since we last detected new inventory at this store."
        />
        <StatCell
          label="LAST SIGNAL"
          value={lastSignal}
          tooltip="Date of the most recent new product detected at this store."
        />
        <StatCell
          label="IN STOCK"
          value={inStockCount}
          bordered={false}
          tooltip="Total products currently marked in stock at this store."
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 18px', flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'var(--pr-text-dim)', letterSpacing: 2, marginRight: 4 }}>
            CHANNELS
          </span>
          {channels.map((game) => (
            <ChannelChip key={game.key} game={game} size="sm" />
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
            paddingTop: 10,
            borderTop: '1px solid var(--pr-border)',
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: 'var(--pr-text-mid)',
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            LATEST · {latest}
          </span>
          <Link to={viewSignalsHref} style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 600, flex: 'none' }}>
            VIEW SIGNALS →
          </Link>
        </div>
      </div>
    </div>
  )
}
