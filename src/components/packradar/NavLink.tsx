import { Link } from 'react-router-dom'

interface NavLinkProps {
  to: string
  active?: boolean
  children: string
}

export function NavLink({ to, active = false, children }: NavLinkProps) {
  if (active) {
    return (
      <span
        style={{
          color: 'var(--pr-signal)',
          borderBottom: '1px solid var(--pr-signal)',
          paddingBottom: 2,
          fontSize: 12,
          letterSpacing: 1,
        }}
      >
        {children}
      </span>
    )
  }

  return (
    <Link to={to} style={{ color: 'var(--pr-text-dim)', fontSize: 12, letterSpacing: 1 }}>
      {children}
    </Link>
  )
}
