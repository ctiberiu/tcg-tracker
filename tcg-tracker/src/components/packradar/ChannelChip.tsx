import type { CSSProperties } from 'react'
import type { GameInfo } from './tokens'
import { StatusDot } from './StatusDot'

type ChipSize = 'sm' | 'md' | 'lg'

const SIZE_STYLE: Record<ChipSize, { padding: string; gap: number; font: number; dot: number }> = {
  sm: { padding: '6px 11px', gap: 7, font: 10, dot: 6 },
  md: { padding: '8px 14px', gap: 8, font: 11, dot: 7 },
  lg: { padding: '10px 16px', gap: 10, font: 11.5, dot: 8 },
}

interface ChannelChipProps {
  game: GameInfo
  count?: number
  countSuffix?: string
  active?: boolean
  size?: ChipSize
  background?: string
}

export function ChannelChip({ game, count, countSuffix, active = false, size = 'md', background = 'var(--pr-bg)' }: ChannelChipProps) {
  if (active) {
    return (
      <span
        style={{
          padding: SIZE_STYLE[size].padding,
          background: 'var(--pr-text-bright)',
          color: 'var(--pr-bg)',
          fontSize: SIZE_STYLE[size].font,
          fontWeight: 700,
          letterSpacing: 1,
        }}
      >
        ALL
      </span>
    )
  }

  const s = SIZE_STYLE[size]
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: s.gap,
    padding: s.padding,
    border: `1px solid ${game.dim}`,
    color: game.color,
    fontSize: s.font,
    letterSpacing: 1,
    fontWeight: 600,
    background,
  }

  return (
    <span style={style}>
      <StatusDot color={game.color} size={s.dot} />
      {game.label}
      {count != null && (
        <span style={{ color: 'var(--pr-text-dim)', fontWeight: 400 }}>
          {count}
          {countSuffix ? ` ${countSuffix}` : ''}
        </span>
      )}
    </span>
  )
}
