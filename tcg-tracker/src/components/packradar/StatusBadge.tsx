import type { ProductStatus } from './tokens'
import { STATUS_COLOR } from './tokens'

interface StatusBadgeProps {
  status: ProductStatus
  size?: number
}

export function StatusBadge({ status, size = 9.5 }: StatusBadgeProps) {
  const color = STATUS_COLOR[status]
  return (
    <span style={{ fontSize: size, color, fontWeight: 700, letterSpacing: 1 }}>
      ● {status}
    </span>
  )
}
