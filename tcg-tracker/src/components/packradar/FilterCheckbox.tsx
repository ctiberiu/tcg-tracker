interface FilterCheckboxProps {
  checked: boolean
  color?: string
}

export function FilterCheckbox({ checked, color = 'var(--pr-signal)' }: FilterCheckboxProps) {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${checked ? color : 'var(--pr-border)'}`,
        background: checked ? color : 'transparent',
      }}
    >
      {checked && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--pr-bg)', lineHeight: 1 }}>✓</span>}
    </span>
  )
}
