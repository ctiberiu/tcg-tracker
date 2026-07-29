import { forwardRef, type ButtonHTMLAttributes } from 'react'

interface FilterDropdownButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  count: number
}

export const FilterDropdownButton = forwardRef<HTMLButtonElement, FilterDropdownButtonProps>(
  function FilterDropdownButton({ label, count, style, ...rest }, ref) {
    const active = count > 0

    return (
      <button
        ref={ref}
        type="button"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '11px 14px',
          minHeight: 44,
          background: active ? 'var(--pr-active-bg)' : 'var(--pr-bg-panel)',
          color: active ? 'var(--pr-signal)' : 'var(--pr-text-mid)',
          fontFamily: 'var(--pr-font-mono)',
          fontSize: 12,
          fontWeight: active ? 600 : 400,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          border: `1px solid ${active ? 'var(--pr-active-border)' : 'var(--pr-border)'}`,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          ...style,
        }}
        {...rest}
      >
        {label}
        {active && (
          <span
            style={{
              padding: '1px 6px',
              background: 'var(--pr-signal)',
              color: 'var(--pr-bg)',
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {count}
          </span>
        )}
        <span aria-hidden="true" style={{ fontSize: 10, color: 'inherit' }}>
          ▾
        </span>
      </button>
    )
  },
)
