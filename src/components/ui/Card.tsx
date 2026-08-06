import type { AnchorHTMLAttributes, FormHTMLAttributes, HTMLAttributes } from 'react'

type CardPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl'
type CardRounded = 'lg' | 'xl' | '2xl'
type CardSurface = 'low' | 'container'

const paddingClass: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
}

const roundedClass: Record<CardRounded, string> = {
  lg: 'rounded',
  xl: 'rounded',
  '2xl': 'rounded-md',
}

interface CardOwnProps {
  padding?: CardPadding
  rounded?: CardRounded
  /** "low" (default) is the standard panel; "container" is the slightly-recessed look used for nested items, like a product row inside the admin sidebar. */
  surface?: CardSurface
  /** Persistent glowing primary-colored border for clickable cards (product tiles), intensifying on hover — not just a hover-only ring. */
  interactive?: boolean
  className?: string
}

function cardClasses({ padding = 'lg', rounded = 'xl', surface = 'low', interactive = false, className = '' }: CardOwnProps) {
  return [
    surface === 'container' ? 'bg-surface-container' : 'bg-surface-low',
    roundedClass[rounded],
    paddingClass[padding],
    interactive
      ? 'overflow-hidden border border-primary/40 shadow-[0_0_16px_-6px_var(--color-primary)] hover:border-primary/70 hover:shadow-[0_0_20px_-4px_var(--color-primary)] transition-all'
      : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

interface CardProps extends CardOwnProps, HTMLAttributes<HTMLDivElement> {
  as?: 'div'
}

interface CardFormProps extends CardOwnProps, FormHTMLAttributes<HTMLFormElement> {
  as: 'form'
}

interface CardAnchorProps extends CardOwnProps, AnchorHTMLAttributes<HTMLAnchorElement> {
  as: 'a'
}

/** The "bg-surface-low rounded-xl" panel used for every form, list row, and product tile (incl. the clickable product-card link). */
export function Card({ padding, rounded, surface, interactive, className, as = 'div', ...props }: CardProps | CardFormProps | CardAnchorProps) {
  const classes = cardClasses({ padding, rounded, surface, interactive, className })
  if (as === 'form') {
    return <form className={classes} {...(props as FormHTMLAttributes<HTMLFormElement>)} />
  }
  if (as === 'a') {
    // "a" is inline by default — a card-styled link always wants block, whether
    // or not its parent happens to be a flex/grid container that would've
    // blockified it anyway.
    return <a className={`block ${classes}`} {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)} />
  }
  return <div className={classes} {...(props as HTMLAttributes<HTMLDivElement>)} />
}
