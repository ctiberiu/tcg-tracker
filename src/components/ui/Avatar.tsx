import type { HTMLAttributes } from 'react'

type AvatarSize = 'sm' | 'md'
type AvatarVariant = 'circle' | 'mark'

const sizeClass: Record<AvatarSize, string> = {
  sm: 'w-6 h-6 text-primary text-xs font-bold shrink-0',
  md: 'w-10 h-10',
}

const variantClass: Record<AvatarVariant, string> = {
  circle: 'rounded-full bg-primary/20',
  /** The brand logo mark — a bordered, glowing square instead of a filled circle. */
  mark: 'rounded border border-primary/70 bg-surface text-primary font-mono font-bold shadow-[0_0_12px_-4px_var(--color-primary)]',
}

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  size?: AvatarSize
  variant?: AvatarVariant
}

/** Filled circle (numbered step indicators) or bordered/glowing square (the brand logo mark in AppSidebar / DashboardPage's header). */
export function Avatar({ size = 'md', variant = 'circle', className = '', ...props }: AvatarProps) {
  const classes = ['flex items-center justify-center', variantClass[variant], sizeClass[size], className]
    .filter(Boolean)
    .join(' ')
  return <div className={classes} {...props} />
}
