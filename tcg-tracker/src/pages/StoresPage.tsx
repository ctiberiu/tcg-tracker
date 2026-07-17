import { useStoreHealth } from '../hooks/useStoreHealth'
import {
  StatusStrip,
  NavBar,
  PageHeader,
  StoreCard,
  CtaButton,
  PackRadarFooter,
  MobileTabBar,
} from '../components/packradar'

export function StoresPage() {
  const { storeHealths, healthy, loading } = useStoreHealth()

  const respondingCount = storeHealths.filter((s) => s.status === 'OK').length

  return (
    <div className="packradar pr-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <StatusStrip lastSweepTime={new Date().toLocaleTimeString('ro-RO')} storeCount={storeHealths.length} healthy={healthy} />
      <NavBar active="stores" />

      <PageHeader
        title="Stores on watch"
        crumbCurrent="STORES"
        meta={`${storeHealths.length} STORES MONITORED · SWEEP EVERY 15 MIN · ${respondingCount}/${storeHealths.length} RESPONDING`}
      />

      <div style={{ padding: '0 var(--pr-gutter)', flex: 1 }}>
        {loading && (
          <p style={{ color: 'var(--pr-text-dim)', fontSize: 13 }}>Loading stores…</p>
        )}

        {!loading && (
          <div className="pr-store-grid">
            {storeHealths.map((store) => (
              <StoreCard
                key={store.id}
                name={store.name}
                domain={store.domain}
                status={store.status}
                signals7d={store.signals7d}
                lastSweep={store.lastSweep}
                lastSignal={store.lastSignal}
                inStockCount={store.inStockCount}
                channels={store.channels}
                latest={store.latest}
                viewSignalsHref={`/view?store=${encodeURIComponent(store.name)}`}
              />
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0 0' }}>
          <CtaButton variant="dashed" size="sm" disabled>+ REQUEST A STORE</CtaButton>
        </div>
      </div>

      <PackRadarFooter />
      <MobileTabBar active="stores" />
    </div>
  )
}
