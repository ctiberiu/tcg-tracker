import { Link } from 'react-router-dom'
import { GamePageLinks } from './GamePageLinks'
import { openPushSettings } from './pushSettings'

/**
 * Shared footer. Carries the game-page links on every page that renders it, so
 * the four Romanian pages are cross-linked to each other and reachable from
 * /view, /stores and the 404 rather than only from the landing page.
 *
 * /privacy is linked here too. It was declared as a route with its own meta and
 * linked from nowhere at all: an orphan the sitemap would have declared without
 * a single path to it.
 *
 * NOTIFICATIONS is the permanent way back into the push settings. It has to live
 * somewhere: the floating prompt hides itself once a device is subscribed (and
 * after a dismissal), so without a fixed entry point a visitor who has turned
 * alerts on has no route to changing their games or turning them off again.
 */
export function PackRadarFooter() {
  return (
    <div
      className="pr-footer"
      style={{
        marginTop: 36,
        padding: '18px var(--pr-gutter)',
        borderTop: '1px solid var(--pr-border)',
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <GamePageLinks size="sm" />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--pr-text-dim)', letterSpacing: 1 }}>
          NO NEW SIGNALS. RADAR IS LIVE.
        </span>
        <span style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <button
            type="button"
            onClick={openPushSettings}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 11,
              color: 'var(--pr-text-dim)',
              letterSpacing: 1,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            NOTIFICATIONS
          </button>
          <Link to="/privacy" style={{ fontSize: 11, color: 'var(--pr-text-dim)', letterSpacing: 1 }}>
            PRIVACY
          </Link>
          <span style={{ fontSize: 11, color: 'var(--pr-text-dim)', letterSpacing: 1 }}>
            PACKRADAR · RO SWEEP · 2026
          </span>
        </span>
      </div>
    </div>
  )
}
