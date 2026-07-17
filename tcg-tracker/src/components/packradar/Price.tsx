interface PriceProps {
  amount: number | null
  size?: number
  weight?: number
}

export function Price({ amount, size = 13.5, weight = 700 }: PriceProps) {
  if (amount == null) {
    return (
      <span style={{ fontSize: size, fontWeight: weight, color: 'var(--pr-text-bright)' }}>
        N/A
      </span>
    )
  }

  const formatted = amount.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <span style={{ fontSize: size, fontWeight: weight, color: 'var(--pr-text-bright)' }}>
      {formatted} lei
    </span>
  )
}
