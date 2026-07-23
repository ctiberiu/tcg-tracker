import { useProducts } from '../hooks/useProducts'
import { useStores } from '../hooks/useStores'
import { useStoreHealth } from '../hooks/useStoreHealth'
import {
  StatusStrip,
  NavBar,
  SweepPanel,
  ChannelChip,
  SignalRow,
  CtaButton,
  MobileTabBar,
  GAMES,
} from '../components/packradar'

export function RadarFloorPage() {
  const { stores } = useStores()
  const { storeHealths, overallLastSweepAt, healthy } = useStoreHealth()
  const { products, totalCount, loading } = useProducts({ inStockOnly: true, sort: 'newest' })

  const latestSix = products.slice(0, 6)
  const signalCount = totalCount ?? products.length

  const channelCounts = new Map<typeof products[number]['game'], number>()
  for (const p of products) channelCounts.set(p.game, (channelCounts.get(p.game) ?? 0) + 1)
  const channels = Array.from(channelCounts.entries()).map(([key, count]) => ({ game: GAMES[key], count }))

  // Compact sweep panel: most recently active stores first, capped so it stays
  // glanceable rather than listing every monitored store (that's what /stores is for).
  const sweepStores = [...storeHealths]
    .sort((a, b) => new Date(b.lastSweepAt ?? 0).getTime() - new Date(a.lastSweepAt ?? 0).getTime())
    .slice(0, 6)

  return (
    <div className="packradar pr-page">
      <StatusStrip lastSweepTime={new Date().toLocaleTimeString('ro-RO')} storeCount={stores.length} healthy={healthy} />
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
          stores={sweepStores.map((s) => ({ name: s.name, signals: s.signals7d, last: `${s.lastSweep} ago` }))}
          footerLine={healthy ? 'ALL STORES RESPONDING · LAST SWEEP ' + (overallLastSweepAt ? new Date(overallLastSweepAt).toLocaleTimeString('ro-RO') : '—') : 'SOME STORES DEGRADED'}
        />
      </div>

      {/* channels */}
      <div style={{ padding: '48px var(--pr-gutter) 0' }}>
        <div style={{ fontSize: 10, color: 'var(--pr-text-dim)', letterSpacing: 2, marginBottom: 12 }}>
          CHANNELS · ONE COLOR PER GAME
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {channels.map(({ game, count }) => (
            <ChannelChip key={game.key} game={game} count={count} countSuffix="SIGNALS" size="lg" background="var(--pr-bg-panel)" />
          ))}
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
            LATEST SIGNALS · {latestSix.length} OF {signalCount}
          </span>
          <CtaButton variant="ghost" size="sm" to="/view">FULL LOG →</CtaButton>
        </div>
        {!loading && (
          <div style={{ display: 'grid' }}>
            {latestSix.map((product) => (
              <SignalRow
                key={product.id}
                game={GAMES[product.game]}
                date={new Date(product.first_seen).toLocaleDateString('ro-RO')}
                store={product.store_name}
                title={product.title}
                price={product.price}
                status={product.in_stock ? 'IN STOCK' : 'GONE'}
                href={product.url}
              />
            ))}
          </div>
        )}
      </div>

      {/* CTA band */}
      <div style={{ background: 'var(--pr-bg-deep)', padding: 'var(--pr-gutter)', borderTop: '1px solid var(--pr-border)', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--pr-font-display)', fontWeight: 700, fontSize: 26, color: 'var(--pr-text-bright)', marginBottom: 10 }}>
          The full log is live.
        </div>
        <div style={{ fontSize: 12, color: 'var(--pr-text-dim)', letterSpacing: 0.5, marginBottom: 24 }}>
          {signalCount} SIGNALS · FILTER BY CHANNEL, STORE, PRICE, STOCK
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
          <span style={{ fontSize: 11, color: 'var(--pr-text-dim)', letterSpacing: 1 }}>PACKRADAR · RO SWEEP · 2026</span>
        </div>
      </div>

      <MobileTabBar active="landing" />
    </div>
  )
}
