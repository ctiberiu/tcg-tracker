import { useState } from 'react'

interface InfoTooltipProps {
  text: string
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', marginLeft: 5, cursor: 'help' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--pr-text-dim)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="11.5" />
        <circle cx="12" cy="8" r="0.5" fill="var(--pr-text-dim)" />
      </svg>
      {open && (
        <span
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 8,
            padding: '8px 10px',
            background: 'var(--pr-bg)',
            border: '1px solid var(--pr-border-hover)',
            color: 'var(--pr-text-mid)',
            fontSize: 10.5,
            letterSpacing: 0.3,
            textTransform: 'none',
            fontWeight: 400,
            whiteSpace: 'normal',
            width: 170,
            lineHeight: 1.5,
            zIndex: 10,
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
