import type { CSSProperties, ReactNode } from 'react'

interface LabelProps {
  children: ReactNode
  size?: number
  letterSpacing?: number
  style?: CSSProperties
}

export function Label({ children, size = 10, letterSpacing = 2, style }: LabelProps) {
  return (
    <span
      style={{
        fontSize: size,
        letterSpacing,
        color: 'var(--pr-text-dim)',
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </span>
  )
}
