interface RadarSpinnerProps {
  size?: number
}

export function RadarSpinner({ size = 26 }: RadarSpinnerProps) {
  return (
    <span
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1px solid #2EE86C66',
        display: 'inline-block',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background: 'conic-gradient(from 0deg, rgba(46,232,108,.55), transparent 70deg)',
          animation: 'pr-radarspin 4s linear infinite',
          borderRadius: '50%',
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 3,
          height: 3,
          margin: -1.5,
          borderRadius: '50%',
          background: 'var(--pr-signal)',
        }}
      />
    </span>
  )
}
