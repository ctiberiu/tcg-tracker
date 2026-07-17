import { Link } from 'react-router-dom'
import { RadarSpinner } from './RadarSpinner'
import { NavLink } from './NavLink'
import { CtaButton } from './CtaButton'

interface NavBarProps {
  active: 'landing' | 'log' | 'stores'
}

export function NavBar({ active }: NavBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px var(--pr-gutter)',
        borderBottom: '1px solid var(--pr-border)',
      }}
    >
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <RadarSpinner />
        <span
          style={{
            fontFamily: 'var(--pr-font-display)',
            fontWeight: 700,
            fontSize: 18,
            color: 'var(--pr-text-bright)',
            letterSpacing: 0.5,
          }}
        >
          PackRadar
        </span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <div className="pr-navbar-links">
          <NavLink to="/view" active={active === 'log'}>SIGNAL LOG</NavLink>
          <NavLink to="/stores" active={active === 'stores'}>STORES</NavLink>
        </div>
        <CtaButton variant="outline-signal" size="sm" disabled title="Coming soon">
          GET PINGED
        </CtaButton>
      </div>
    </div>
  )
}
