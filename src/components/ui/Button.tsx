import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'solid' | 'soft' | 'neutral' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonOwnProps {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Square icon-only shape (nav items, edit/delete icon actions) instead of a text button. */
  iconOnly?: boolean
  /** Adds a red hover state, for destructive icon/text actions (delete, sign out). */
  destructive?: boolean
  /** Persistent "selected" look for ghost/iconOnly buttons, e.g. the active sidebar item. */
  active?: boolean
  className?: string
}

const base =
  'rounded font-mono uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2'

const variantClass: Record<ButtonVariant, string> = {
  solid: 'bg-primary text-on-primary font-bold hover:bg-primary/90',
  soft: 'bg-primary/10 text-primary font-bold hover:bg-primary/20',
  neutral: 'bg-surface-high text-on-surface font-bold hover:bg-surface-highest',
  ghost: 'text-on-surface-variant hover:bg-surface-high',
  /** Same shape as "soft", error-toned — for an always-red action like Stop, not just a hover warning. */
  danger: 'bg-error/10 text-error font-bold hover:bg-error/20',
}

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-4 py-3 text-sm',
}

const iconSizeClass: Record<ButtonSize, string> = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-10 h-10',
}

function buttonClasses({ variant = 'solid', size = 'md', iconOnly = false, destructive = false, active = false, className = '' }: ButtonOwnProps) {
  return [
    base,
    variantClass[variant],
    iconOnly ? iconSizeClass[size] : sizeClass[size],
    iconOnly ? 'flex items-center justify-center' : '',
    destructive ? 'hover:text-error' : '',
    active && (variant === 'ghost' || iconOnly) ? 'bg-surface-high text-primary' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

interface ButtonProps extends ButtonOwnProps, ButtonHTMLAttributes<HTMLButtonElement> {
  as?: 'button'
}

interface ButtonAnchorProps extends ButtonOwnProps, AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Renders an `<a>` styled identically — for a button-styled download/external link (needs real href/download semantics, not an onClick). */
  as: 'a'
}

/**
 * Shared button primitive. Covers every button style currently duplicated
 * across the app: solid primary CTAs, soft/neutral secondary actions, and
 * square icon-only buttons (nav items, edit/delete).
 */
export function Button({ variant, size, iconOnly, destructive, active, className, as = 'button', ...props }: ButtonProps | ButtonAnchorProps) {
  const classes = buttonClasses({ variant, size, iconOnly, destructive, active, className })
  if (as === 'a') {
    return <a className={classes} {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)} />
  }
  return <button className={classes} {...(props as ButtonHTMLAttributes<HTMLButtonElement>)} />
}
