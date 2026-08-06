interface StatusDotProps {
  color: string
  size?: number
  pulse?: boolean
}

export function StatusDot({ color, size = 8, pulse = false }: StatusDotProps) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 ${size < 8 ? 5 : 7}px ${color}`,
        flex: 'none',
        display: 'inline-block',
        ...(pulse ? { animation: 'pr-pingpulse 2.4s infinite' } : {}),
      }}
    />
  )
}
