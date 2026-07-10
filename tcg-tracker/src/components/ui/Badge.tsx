import type { HTMLAttributes } from 'react'

type BadgeTone = 'neutral' | 'primary' | 'tertiary' | 'error'

const toneClass: Record<BadgeTone, string> = {
  neutral: 'bg-surface-container text-on-surface-variant',
  primary: 'bg-primary/10 text-primary',
  tertiary: 'bg-tertiary/10 text-tertiary',
  error: 'bg-error/10 text-error',
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  bold?: boolean
}

/**
 * Small status pill. Covers AdminPage's neutral count badge and SnipePage's
 * per-status STATUS_STYLES map (idle->neutral, running/grabbed->primary,
 * awaiting_payment/ordered->tertiary, failed->error) — replace that local
 * Record<SnipeTaskStatus, string> with one mapping to BadgeTone instead.
 */
export function Badge({ tone = 'neutral', bold = true, className = '', ...props }: BadgeProps) {
  const classes = [
    'font-mono uppercase tracking-widest text-[10px] px-2 py-0.5 rounded shrink-0',
    bold ? 'font-bold' : '',
    toneClass[tone],
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return <span className={classes} {...props} />
}
