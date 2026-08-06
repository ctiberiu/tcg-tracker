import type { ProductStatus } from './tokens'
import { STATUS_COLOR } from './tokens'

interface StatusBadgeProps {
  status: ProductStatus
  size?: number
  /**
   * Text to show instead of the status value. `status` still picks the colour,
   * so the two cannot drift apart.
   *
   * Exists for the Romanian landing pages, which need "ÎN STOC" on a page whose
   * every other word is Romanian. Localising HERE rather than in `tokens.ts`
   * keeps `ProductStatus`' values as data — they read like an enum and
   * something may compare against them — and leaves /view and /stores English.
   */
  label?: string
}

export function StatusBadge({ status, size = 9.5, label }: StatusBadgeProps) {
  const color = STATUS_COLOR[status]
  return (
    <span style={{ fontSize: size, color, fontWeight: 700, letterSpacing: 1 }}>
      ● {label ?? status}
    </span>
  )
}
