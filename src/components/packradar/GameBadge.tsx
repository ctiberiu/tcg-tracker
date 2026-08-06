import type { GameInfo } from './tokens'
import { StatusDot } from './StatusDot'

interface GameBadgeProps {
  game: GameInfo
}

export function GameBadge({ game }: GameBadgeProps) {
  return (
    <span
      style={{
        position: 'absolute',
        top: 10,
        left: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 9px',
        background: '#060B08e6',
        border: `1px solid ${game.dim}`,
        fontSize: 9,
        color: game.color,
        fontWeight: 700,
        letterSpacing: 1,
        pointerEvents: 'none',
      }}
    >
      <StatusDot color={game.color} size={6} />
      {game.label}
    </span>
  )
}
