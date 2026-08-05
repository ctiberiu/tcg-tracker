import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { useGameLanding } from '../hooks/useGameLanding'
import { useSweepSummary } from '../hooks/useSweepSummary'
import { getStoreBaseName } from '../lib/storeName'
import { selectGameCards, selectShopChips, CARD_COUNT } from '../lib/gameCards'
import {
  formatRoNumber,
  roCount,
  GAME_PAGE_CLOSING_LINE,
  RO_PRODUCT_STATUS,
  type GamePage,
} from '../lib/gamePages'
import {
  StatusStrip,
  NavBar,
  SignalCard,
  SignalCardSkeleton,
  PackRadarFooter,
  MobileTabBar,
  StatusDot,
  GAMES,
} from '../components/packradar'

/**
 * ONE component for every Romanian game landing page. The pages differ in
 * exactly four things — two colour tokens, the copy, the slug and the queried
 * figures — and all four come from the `GAME_PAGES` entry passed in. Adding
 * Magic once `magic-coverage` merges is a registry entry and nothing else.
 *
 * `lang="ro"` sits on this element rather than on <html>: the rest of the app
 * is English, and these are the only Romanian routes.
 *
 * NOT gated behind auth, deliberately. These pages are the acquisition surface,
 * and whatever is gated is de-indexed.
 */

/** Stands in for a figure that has not loaded yet. Never a zero: a real "0" is
 *  meaningful on this page (it triggers the empty state) and must not be
 *  indistinguishable from "not known yet". */
const PENDING = '···'

interface GameLandingPageProps {
  page: GamePage
}

export function GameLandingPage({ page }: GameLandingPageProps) {
  const { path, game, name, hook, metaTitle, metaDescription } = page
  const info = GAMES[game]

  useDocumentMeta({ title: metaTitle, description: metaDescription, path })

  const { totalCount, inStockCount, shops, recent, loading, error } = useGameLanding(game)
  // Same store figure and health dot the rest of the site shows, from the cheap
  // read path. NOTE this is the count of distinct SHOPS (one per physical
  // store), not of `stores` rows, so it reads lower than the row count — but it
  // matches "/" and "/stores", and disagreeing with them would be worse than
  // disagreeing with the mockup's snapshot.
  const { storeCount, healthy, overallLastSweepAt } = useSweepSummary()

  const cards = selectGameCards(recent)
  const upperName = name.toUpperCase()
  // Chips are chosen FROM the cards, not independently of them: a shop in the
  // grid that is missing from the list above it reads as the page contradicting
  // itself. See selectShopChips.
  const { visible: visibleShops, hidden: hiddenShops } = selectShopChips(shops, cards)

  const rootStyle = { '--pr-g': info.color, '--pr-gd': info.dim } as CSSProperties

  return (
    <div className="packradar pr-page pr-gp" lang="ro" style={rootStyle}>
      <StatusStrip
        lastSweepTime={
          overallLastSweepAt ? new Date(overallLastSweepAt).toLocaleTimeString('ro-RO') : PENDING
        }
        storeCount={storeCount}
        healthy={healthy}
      />
      <NavBar active="none" />

      <div className="pr-gp-body">
        <div className="pr-gp-crumb">
          <Link to="/" style={{ color: 'var(--pr-text-dim)' }}>← RADAR FLOOR</Link>{' '}
          <span style={{ color: 'var(--pr-border)' }}>/</span>{' '}
          <span style={{ color: 'var(--pr-g)' }}>CĂRȚI {upperName}</span>
        </div>

        <div className="pr-gp-hero">
          <div style={{ minWidth: 0 }}>
            <h1 className="pr-gp-h1">
              Cărți <em>{name}</em> în România
            </h1>

            <div className="pr-gp-stats">
              <span className="pr-gp-stat pr-gp-stat--live">
                <b>{loading || error ? PENDING : formatRoNumber(inStockCount)}</b> în stoc acum
              </span>
              <span className="pr-gp-stat">
                <b>{loading || error ? PENDING : formatRoNumber(totalCount)}</b>{' '}
                {totalCount === 1 ? 'produs urmărit' : 'produse urmărite'}
              </span>
              <span className="pr-gp-stat">
                <b>{loading || error ? PENDING : formatRoNumber(shops.length)}</b>{' '}
                {shops.length === 1 ? 'magazin' : 'magazine'}
              </span>
            </div>

            {shops.length > 0 && (
              <div className="pr-gp-shops">
                <div className="pr-gp-shops-label">MAGAZINE URMĂRITE</div>
                <div className="pr-gp-shoplist">
                  {visibleShops.map((shop) => (
                    <span key={shop} className="pr-gp-shop">{shop}</span>
                  ))}
                  {hiddenShops > 0 && <span className="pr-gp-shop">+ încă {hiddenShops}</span>}
                </div>
              </div>
            )}
          </div>

          <div className="pr-gp-copy">
            <p>
              PackRadar urmărește constant stocurile de cărți {name} din magazinele online din
              România. Când un produs reapare în stoc, îl vezi aici imediat, fără să dai refresh și
              fără să urmărești toate magazinele în paralel.
            </p>

            {/* Held back until the figures are real. The whole point of this page
                is that its numbers are queried, so rendering the initial zeros
                for a beat would publish four wrong ones on every load. */}
            {!loading && !error && <p>{summarySentence(totalCount, inStockCount, shops.length, name, hook)}</p>}

            <p className="pr-gp-kicker">{GAME_PAGE_CLOSING_LINE}</p>
          </div>
        </div>

        <div className="pr-gp-sectionhead">
          <span className="pr-gp-sectionlabel">CELE MAI NOI PRODUSE ÎN STOC</span>
          <span className="pr-gp-live">
            <StatusDot color="var(--pr-g)" size={6} />
            ACTUALIZAT CONTINUU
          </span>
        </div>

        {loading && (
          <div className="pr-signal-grid">
            {Array.from({ length: CARD_COUNT }, (_, i) => <SignalCardSkeleton key={i} />)}
          </div>
        )}

        {!loading && error && (
          <div className="pr-gp-empty">
            <div className="pr-gp-empty-title">Datele nu s-au încărcat</div>
            <p>
              Nu am putut citi stocurile acum. Reîncarcă pagina peste câteva momente, radarul
              continuă să scaneze.
            </p>
          </div>
        )}

        {/* A game with nothing in stock must not show an empty grid next to a
            bare "0". Reachable today (One Piece is the thinnest of the four)
            and certain to be reachable for a newly added game. */}
        {!loading && !error && cards.length === 0 && (
          <div className="pr-gp-empty">
            <div className="pr-gp-empty-title">Nimic în stoc acum</div>
            <p>
              Niciun produs {name} nu este disponibil în acest moment în magazinele urmărite.
              Radarul scanează în continuare, iar produsele apar aici imediat ce revin în stoc.
            </p>
          </div>
        )}

        {!loading && !error && cards.length > 0 && (
          <div className="pr-signal-grid">
            {cards.map((product) => (
              <SignalCard
                key={product.id}
                game={GAMES[product.game]}
                store={getStoreBaseName(product.store_name)}
                date={new Date(product.first_seen).toLocaleDateString('ro-RO')}
                title={product.title}
                price={product.price}
                status="IN STOCK"
                statusLabel={RO_PRODUCT_STATUS['IN STOCK']}
                imageUrl={product.image_url}
                href={product.url}
              />
            ))}
          </div>
        )}

        <div className="pr-gp-cta">
          <Link to={`/view?game=${game}`} className="pr-gp-ctalink">
            VEZI TOATE PRODUSELE {upperName} →
          </Link>
        </div>
        <div className="pr-gp-note">
          Te duce la jurnalul complet, filtrat pe {name}
          {!loading && !error && ` · ${roCount(totalCount, 'produs', 'produse')}`}
        </div>
      </div>

      <PackRadarFooter />
      <MobileTabBar active="none" />
    </div>
  )
}

/**
 * Paragraph 2, the only sentence carrying live figures.
 *
 * Three variants because Romanian agreement and honesty both change with the
 * numbers: "1 magazin" not "1 magazine" (Magic has one shop today), and
 * "dintre care 0 sunt disponibile" is a sentence no one would write.
 */
function summarySentence(
  totalCount: number,
  inStockCount: number,
  shopCount: number,
  name: string,
  hook: string,
) {
  if (totalCount === 0) {
    return `Încă nu urmărim niciun produs ${name} în magazinele online din România. Pagina se completează de la sine imediat ce apar primele produse.`
  }

  const tracked = (
    <>
      Urmărim acum <strong>{roCount(totalCount, 'produs', 'produse')} {name}</strong> la{' '}
      {roCount(shopCount, 'magazin', 'magazine')}
    </>
  )

  if (inStockCount === 0) {
    return <>{tracked}, dar niciunul nu este disponibil acum. {hook}</>
  }
  if (inStockCount === 1) {
    return <>{tracked}, dintre care <strong>1 este disponibil</strong>. {hook}</>
  }
  return (
    <>
      {tracked}, dintre care <strong>{formatRoNumber(inStockCount)} sunt disponibile</strong>. {hook}
    </>
  )
}
