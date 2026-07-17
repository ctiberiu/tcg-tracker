import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'

type CtaVariant = 'solid' | 'ghost' | 'outline-signal' | 'dashed'
type CtaSize = 'sm' | 'md'

const VARIANT_STYLE: Record<CtaVariant, CSSProperties> = {
  solid: { background: 'var(--pr-signal)', color: 'var(--pr-bg)', fontWeight: 700, border: '1px solid var(--pr-signal)' },
  ghost: { border: '1px solid var(--pr-border)', color: 'var(--pr-text-mid)', fontWeight: 600, background: 'transparent' },
  'outline-signal': { border: '1px solid var(--pr-signal)', color: 'var(--pr-signal)', fontWeight: 600, background: 'transparent' },
  dashed: { border: '1px dashed var(--pr-border)', color: 'var(--pr-text-mid)', fontWeight: 600, background: 'transparent' },
}

const SIZE_STYLE: Record<CtaSize, CSSProperties> = {
  sm: { padding: '9px 18px', fontSize: 12 },
  md: { padding: '14px 26px', fontSize: 13 },
}

interface CtaButtonBaseProps {
  variant?: CtaVariant
  size?: CtaSize
  letterSpacing?: number
  fullWidth?: boolean
  children: ReactNode
}

interface CtaButtonLinkProps extends CtaButtonBaseProps {
  to: string
  href?: never
  onClick?: never
  disabled?: never
}

interface CtaButtonAnchorProps extends CtaButtonBaseProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'style' | 'className' | 'children'> {
  to?: never
  href: string
}

interface CtaButtonButtonProps extends CtaButtonBaseProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style' | 'className' | 'children'> {
  to?: never
  href?: never
}

export function CtaButton({ variant = 'ghost', size = 'md', letterSpacing = 1, fullWidth = false, children, ...props }: CtaButtonLinkProps | CtaButtonAnchorProps | CtaButtonButtonProps) {
  const style: CSSProperties = {
    display: fullWidth ? 'block' : 'inline-block',
    width: fullWidth ? '100%' : undefined,
    textAlign: fullWidth ? 'center' : undefined,
    letterSpacing,
    ...SIZE_STYLE[size],
    ...VARIANT_STYLE[variant],
  }

  if ('to' in props && props.to) {
    return (
      <Link to={props.to} style={style}>
        {children}
      </Link>
    )
  }

  if ('href' in props && props.href) {
    const { href, ...anchorProps } = props as CtaButtonAnchorProps
    return (
      <a href={href} style={style} {...anchorProps}>
        {children}
      </a>
    )
  }

  const { disabled, type = 'button', ...buttonProps } = props as CtaButtonButtonProps
  return (
    <button
      type={type}
      disabled={disabled}
      style={{ ...style, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}
      {...buttonProps}
    >
      {children}
    </button>
  )
}
