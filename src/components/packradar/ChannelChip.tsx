import type { CSSProperties } from 'react'
import type { GameInfo } from './tokens'
import { StatusDot } from './StatusDot'

type ChipSize = 'sm' | 'md' | 'lg'

const SIZE_STYLE: Record<ChipSize, { padding: string; gap: number; font: number; dot: number }> = {
  sm: { padding: '6px 11px', gap: 7, font: 10, dot: 6 },
  md: { padding: '8px 14px', gap: 8, font: 11, dot: 7 },
  lg: { padding: '10px 16px', gap: 10, font: 11.5, dot: 8 },
}

// Only label/color/dim are used here — loosened from the full GameInfo shape
// so a non-registry pseudo-game (e.g. an "ALL" chip) can be passed too.
type ChipGame = Pick<GameInfo, 'label' | 'color' | 'dim'>

interface ChannelChipProps {
  game: ChipGame
  count?: number
  countSuffix?: string
  active?: boolean
  size?: ChipSize
  background?: string
  onClick?: () => void
}

export function ChannelChip({ game, count, countSuffix, active = false, size = 'md', background = 'var(--pr-bg)', onClick }: ChannelChipProps) {
  const s = SIZE_STYLE[size]
  const Tag = onClick ? 'button' : 'span'
  const interactiveProps = onClick ? { type: 'button' as const, onClick } : {}

  if (active) {
    const style: CSSProperties = {
      padding: s.padding,
      background: 'var(--pr-text-bright)',
      color: 'var(--pr-bg)',
      fontSize: s.font,
      fontWeight: 700,
      letterSpacing: 1,
      border: 'none',
      fontFamily: 'inherit',
      cursor: onClick ? 'pointer' : 'default',
    }
    return (
      <Tag {...interactiveProps} style={style}>
        {game.label}
      </Tag>
    )
  }

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
    fontFamily: 'inherit',
    cursor: onClick ? 'pointer' : 'default',
  }

  return (
    <Tag {...interactiveProps} style={style}>
      <StatusDot color={game.color} size={s.dot} />
      {game.label}
      {count != null && (
        <span style={{ color: 'var(--pr-text-dim)', fontWeight: 400 }}>
          {count}
          {countSuffix ? ` ${countSuffix}` : ''}
        </span>
      )}
    </Tag>
  )
}
