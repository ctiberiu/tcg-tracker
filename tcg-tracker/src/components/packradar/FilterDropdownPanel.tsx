import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react'

interface FilterDropdownPanelProps extends HTMLAttributes<HTMLDivElement> {
  width: number
  maxHeight: number | null
  floatingStyles: CSSProperties
}

export const FilterDropdownPanel = forwardRef<HTMLDivElement, FilterDropdownPanelProps>(function FilterDropdownPanel(
  { width, maxHeight, floatingStyles, style, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{
        ...floatingStyles,
        width,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: maxHeight ?? undefined,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--pr-popover-bg)',
        border: '1px solid var(--pr-border)',
        zIndex: 60,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
})
