import { Link } from 'react-router-dom'
import { StatusDot } from './StatusDot'

interface MobileTabBarProps {
  active: 'landing' | 'log' | 'stores'
}

const TABS: { key: MobileTabBarProps['active']; label: string; to: string }[] = [
  { key: 'landing', label: 'RADAR', to: '/' },
  { key: 'log', label: 'SIGNAL LOG', to: '/view' },
  { key: 'stores', label: 'STORES', to: '/stores' },
]

export function MobileTabBar({ active }: MobileTabBarProps) {
  return (
    <nav className="pr-mobile-tabbar">
      {TABS.map((tab) => {
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            to={tab.to}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '10px 0',
              minHeight: 44,
              fontSize: 10,
              letterSpacing: 1,
              fontWeight: 600,
              color: isActive ? 'var(--pr-signal)' : 'var(--pr-text-dim)',
              borderTop: isActive ? '2px solid var(--pr-signal)' : '2px solid transparent',
            }}
          >
            {isActive ? <StatusDot color="var(--pr-signal)" size={5} /> : <span style={{ height: 5 }} />}
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
