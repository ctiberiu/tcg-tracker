interface FilterDropdownButtonProps {
  label: string
  count: number
  open: boolean
  onClick: () => void
}

export function FilterDropdownButton({ label, count, open, onClick }: FilterDropdownButtonProps) {
  const active = count > 0

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
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
      }}
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
      <span style={{ fontSize: 10, color: 'inherit' }}>▾</span>
    </button>
  )
}
