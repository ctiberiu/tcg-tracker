import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { RadarSpinner } from './packradar'

interface AppSidebarProps {
  activePage: 'admin' | 'snipe'
}

const baseButtonStyle = {
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid transparent',
  background: 'transparent',
  cursor: 'pointer',
} as const

export function AppSidebar({ activePage }: AppSidebarProps) {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  const itemStyle = (active: boolean) => ({
    ...baseButtonStyle,
    color: active ? 'var(--pr-signal)' : 'var(--pr-text-dim)',
    borderColor: active ? 'var(--pr-signal)' : 'transparent',
  })

  return (
    <aside
      className="packradar"
      style={{
        width: 72,
        minHeight: '100vh',
        background: 'var(--pr-bg-panel)',
        borderRight: '1px solid var(--pr-border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 0',
        gap: 8,
        flexShrink: 0,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <RadarSpinner size={26} />
      </div>
      <button
        onClick={() => navigate('/view')}
        title="Products"
        style={itemStyle(false)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
      </button>
      <button
        onClick={() => navigate('/snipe')}
        title="Snipe"
        style={itemStyle(activePage === 'snipe')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
        </svg>
      </button>
      <button
        onClick={() => navigate('/admin')}
        title="Admin"
        style={itemStyle(activePage === 'admin')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <div style={{ marginTop: 'auto' }}>
        <button
          onClick={signOut}
          title="Sign out"
          style={{ ...baseButtonStyle, color: 'var(--pr-text-dim)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--pr-status-gone)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--pr-text-dim)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
