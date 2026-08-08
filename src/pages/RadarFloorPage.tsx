import { Link, useNavigate } from 'react-router-dom'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { useProducts } from '../hooks/useProducts'
import { useSweepSummary } from '../hooks/useSweepSummary'
import { getStoreBaseName } from '../lib/storeName'
import {
  StatusStrip,
  NavBar,
  SweepPanel,
  ChannelChip,
  SignalRow,
  SignalRowSkeleton,
  CtaButton,
  MobileTabBar,
  GamePageLinks,
  GAMES,
  PENDING,
} from '../components/packradar'

/** Six rows are fetched and six are rendered, so six is also the skeleton count. */
const SKELETON_ROWS = 6

/**
 * Chip-shaped placeholders for the channel row.
 *
 * Widths are close to a real `size="lg"` chip (measured 236px for "WEISS SCHWARZ
 * 1 SIGNALS"), which matters at 390px: the row wraps, so a too-narrow
 * placeholder packs two per line where the real chips take one each, and the row
 * came out 101px short. At these widths the wrap count matches at both 1400px
 * and 390px.
 *
 * The COUNT, though, is data — one chip per distinct game among the six newest
 * in-stock products, so 1 to 5. Four is what the query returns today. This is
 * the one dimension on this page a skeleton cannot pin, and the honest fix is
 * upstream: see the note on the channel row below.
 */
const SKELETON_CHIPS = [232, 208, 220, 200]

export function RadarFloorPage() {
  useDocumentMeta({
    title: 'PackRadar — live TCG restock tracker for Romanian shops',
    // Deliberately says that tracking is constant, never how constant. Publishing
    // the sweep interval tells every shop exactly what to rate-limit, and a meta
    // description is the most public string in the app — it is what Google prints
    // under the result. This line read "Updated every two minutes." until 2026-08-05.
    description: 'Track Pokémon, One Piece, Lorcana, Magic and Yu-Gi-Oh restocks across every Romanian TCG shop. Continuously updated.',
    path: '/',
  })

  const navigate = useNavigate()
  // useSweepSummary, not useStoreHealth: this page renders a count, a health dot,
  // a sweep time and six store names. The full hook pages the entire products
  // table for per-store titles and channel sets that /stores needs and this page
  // never shows — 7 requests / 78.5 kB over the wire, down to 2 / 7.9 kB.
  const {
    stores: storeSummaries,
    storeCount,
    overallLastSweepAt,
    healthy,
    loading: summaryLoading,
  } = useSweepSummary()
  // Six cards are rendered, so six rows are fetched. This used to take 100 and
  // discard 94 of them.
  const { products, totalCount, loading } = useProducts({ inStockOnly: true, sort: 'newest', pageSize: 6 })

  const latestSix = products.slice(0, 6)
  const signalCount = totalCount ?? products.length

  const channelCounts = new Map<typeof products[number]['game'], number>()
  for (const p of products) channelCounts.set(p.game, (channelCounts.get(p.game) ?? 0) + 1)
  const channels = Array.from(channelCounts.entries()).map(([key, count]) => ({ game: GAMES[key], count }))

  // Compact sweep panel: most recently active stores first, capped so it stays
  // glanceable rather than listing every monitored store (that's what /stores is for).
  const sweepStores = [...storeSummaries]
    .sort((a, b) => new Date(b.lastSweepAt ?? 0).getTime() - new Date(a.lastSweepAt ?? 0).getTime())
    .slice(0, 6)

  return (
    <div className="packradar pr-page">
      {/* Was `new Date().toLocaleTimeString('ro-RO')` — the moment the page was
          opened, printed under the words LAST SWEEP. It read as fresh whatever
          the scraper had actually done, including not having run for a day.
          GameLandingPage already did this correctly; this is that line. */}
      <StatusStrip
        lastSweepTime={
          overallLastSweepAt ? new Date(overallLastSweepAt).toLocaleTimeString('ro-RO') : PENDING
        }
        storeCount={storeCount}
        healthy={healthy}
        loading={summaryLoading}
      />
      <NavBar active="landing" />

      {/* hero */}
      <div
        className="pr-hero-grid"
        style={{
          padding: '56px var(--pr-gutter) 0',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'var(--pr-signal)', letterSpacing: 3, marginBottom: 18 }}>
            /// SCALPERS HAVE BOTS. YOU HAVE RADAR.
          </div>
          <div
            style={{
              fontFamily: 'var(--pr-font-display)',
              fontWeight: 700,
              fontSize: 62,
              lineHeight: 1.02,
              color: 'var(--pr-text-bright)',
              letterSpacing: -1,
              marginBottom: 20,
            }}
          >
            Always scanning.
          </div>
          <div
            style={{
              maxWidth: 460,
              lineHeight: 1.7,
              marginBottom: 30,
              fontFamily: 'var(--pr-font-display)',
              fontSize: 15.5,
              color: 'var(--pr-text-mid)',
            }}
          >
            PackRadar sweeps every major Romanian TCG store on a constant cycle and pings you the second
            inventory changes — before the Facebook groups know.
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <CtaButton variant="solid" to="/view">OPEN SIGNAL LOG</CtaButton>
            <CtaButton variant="ghost" disabled>HOW THE SWEEP WORKS</CtaButton>
          </div>
        </div>

        <SweepPanel
          loading={summaryLoading}
          stores={sweepStores.map((s) => ({ name: s.name, signals: s.signals7d, last: `${s.lastSweep} ago` }))}
          footerLine={healthy ? 'ALL STORES RESPONDING · LAST SWEEP ' + (overallLastSweepAt ? new Date(overallLastSweepAt).toLocaleTimeString('ro-RO') : '—') : 'SOME STORES DEGRADED'}
        />
      </div>

      {/* channels */}
      <div style={{ padding: '48px var(--pr-gutter) 0' }}>
        <div style={{ fontSize: 10, color: 'var(--pr-text-dim)', letterSpacing: 2, marginBottom: 12 }}>
          CHANNELS · ONE COLOR PER GAME
        </div>
        <div className="pr-channel-strip" style={{ display: 'flex', gap: 10 }}>
          {loading &&
            SKELETON_CHIPS.map((width) => (
              // A `size="lg"` chip's box, reproduced rather than approximated:
              // 10px/16px padding, a 1px border and an 11.5px line box, giving
              // 17.25 + 20 + 2 = 39.25px. A flat `height: 38` was 1.25px short.
              // The border is transparent so the placeholder reads as one block.
              <span
                key={width}
                className="pr-shimmer"
                style={{
                  display: 'block',
                  boxSizing: 'border-box',
                  padding: '10px 16px',
                  border: '1px solid transparent',
                  fontSize: 11.5,
                  width,
                }}
              >
                {'\u00A0'}
              </span>
            ))}
          {!loading && channels.map(({ game, count }) => (
            <ChannelChip
              key={game.key}
              game={game}
              count={count}
              countSuffix="SIGNALS"
              size="lg"
              background="var(--pr-bg-panel)"
              onClick={() => navigate(`/view?game=${game.key}`)}
            />
          ))}
        </div>

        {/* The chips above are ChannelChip, which renders a <button> with an
            onClick — so nothing on this page was ever a link to a game. These
            are, and they point at the Romanian landing pages rather than at
            /view?game=x. The two destinations are deliberately both present:
            the chips filter the log in place, these open a page. */}
        <div style={{ marginTop: 28 }}>
          <GamePageLinks label="GAME PAGES · IN ROMANIAN" />
        </div>
      </div>

      {/* latest signals */}
      <div style={{ padding: '44px var(--pr-gutter) 48px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderBottom: '1px solid var(--pr-border)',
            paddingBottom: 10,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--pr-text-dim)', letterSpacing: 2 }}>
            {/* "0 OF 0" during load, in the same type as the real figure. */}
            LATEST SIGNALS · {loading ? PENDING : `${latestSix.length} OF ${signalCount}`}
          </span>
          <CtaButton variant="ghost" size="sm" to="/view">FULL LOG →</CtaButton>
        </div>
        <div style={{ display: 'grid' }}>
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => <SignalRowSkeleton key={i} />)
            : latestSix.map((product) => (
                <SignalRow
                  key={product.id}
                  game={GAMES[product.game]}
                  date={new Date(product.first_seen).toLocaleDateString('ro-RO')}
                  store={getStoreBaseName(product.store_name)}
                  title={product.title}
                  price={product.price}
                  status={product.in_stock ? 'IN STOCK' : 'GONE'}
                  href={product.url}
                />
              ))}
        </div>
      </div>

      {/* CTA band */}
      <div style={{ background: 'var(--pr-bg-deep)', padding: 'var(--pr-gutter)', borderTop: '1px solid var(--pr-border)', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--pr-font-display)', fontWeight: 700, fontSize: 26, color: 'var(--pr-text-bright)', marginBottom: 10 }}>
          The full log is live.
        </div>
        <div style={{ fontSize: 12, color: 'var(--pr-text-dim)', letterSpacing: 0.5, marginBottom: 24 }}>
          {loading ? PENDING : signalCount} SIGNALS · FILTER BY CHANNEL, STORE, PRICE, STOCK
        </div>
        <CtaButton variant="solid" to="/view">OPEN SIGNAL LOG →</CtaButton>

        <div
          className="pr-footer"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 36,
            paddingTop: 18,
            borderTop: '1px solid var(--pr-border)',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--pr-text-dim)', letterSpacing: 1 }}>NO NEW SIGNALS. RADAR IS LIVE.</span>
          {/* This page has its own copy of the footer rather than using
              PackRadarFooter, so the privacy link has to be added here too.
              Without it /privacy is two hops from the homepage, and the
              homepage is the most-crawled page on the site. Deliberately only
              the link: merging the two footers is a refactor, and folding one
              into a link change is how a small diff becomes a regression. */}
          <Link to="/privacy" style={{ fontSize: 11, color: 'var(--pr-text-dim)', letterSpacing: 1 }}>
            PRIVACY
          </Link>
          <span style={{ fontSize: 11, color: 'var(--pr-text-dim)', letterSpacing: 1 }}>PACKRADAR · RO SWEEP · 2026</span>
        </div>
      </div>

      <MobileTabBar active="landing" />
    </div>
  )
}
