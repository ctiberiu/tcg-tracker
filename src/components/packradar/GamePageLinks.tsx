import { Link } from 'react-router-dom'
import { GAME_PAGES } from '../../lib/gamePages'
import { GAMES } from './tokens'

interface GamePageLinksProps {
  /** Section label above the row. Omitted in the footer, where the row is the
   *  label's own context. */
  label?: string
  size?: 'sm' | 'md'
}

/**
 * Links to every Romanian game landing page, built from the same registry the
 * routes and the sitemap are. Adding Magic puts it here too, with no edit.
 *
 * These are real `<a>` elements, which is the entire point. `ChannelChip` — the
 * row this sits under on the landing page — renders a `<button>` with an
 * onClick, so a crawler following links from "/" has never been able to reach
 * anything but "/", "/view" and "/stores". A page nothing links to is a page
 * Google finds slowly or not at all, which is how this work quietly produces
 * nothing.
 *
 * Anchor text is the target's own Romanian name ("Cărți Pokémon"), not a
 * generic label, because the anchor text is half of what the link is for.
 */
export function GamePageLinks({ label, size = 'md' }: GamePageLinksProps) {
  const fontSize = size === 'sm' ? 11 : 12

  return (
    <div>
      {label && (
        <div style={{ fontSize: 10, color: 'var(--pr-text-dim)', letterSpacing: 2, marginBottom: 12 }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {GAME_PAGES.map((page) => {
          const game = GAMES[page.game]
          return (
            <Link
              key={page.path}
              to={page.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: size === 'sm' ? '6px 11px' : '8px 14px',
                border: `1px solid ${game.dim}`,
                background: 'var(--pr-bg-panel)',
                color: game.color,
                fontSize,
                letterSpacing: 0.5,
                fontWeight: 600,
              }}
            >
              Cărți {page.name}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
