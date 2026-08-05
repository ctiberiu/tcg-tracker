import { Link } from 'react-router-dom'
import { GamePageLinks } from './GamePageLinks'

/**
 * Shared footer. Carries the game-page links on every page that renders it, so
 * the four Romanian pages are cross-linked to each other and reachable from
 * /view, /stores and the 404 rather than only from the landing page.
 *
 * /privacy is linked here too. It was declared as a route with its own meta and
 * linked from nowhere at all: an orphan the sitemap would have declared without
 * a single path to it.
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
