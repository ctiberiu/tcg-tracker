import { useStoreHealth } from '../hooks/useStoreHealth'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import {
  StatusStrip,
  NavBar,
  PageHeader,
  StoreCard,
  CtaButton,
  PackRadarFooter,
  MobileTabBar,
  PENDING,
} from '../components/packradar'

export function StoresPage() {
  useDocumentMeta({
    title: 'Shop status — which Romanian TCG stores are being tracked | PackRadar',
    description: 'Live scan status for every Romanian TCG shop PackRadar monitors, including when each was last checked.',
    path: '/stores',
  })

  const { storeHealths, healthy, loading, overallLastSweepAt } = useStoreHealth()

  const respondingCount = storeHealths.filter((s) => s.status === 'OK').length

  return (
    <div className="packradar pr-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Was the time the page was opened, labelled LAST SWEEP. Note this page's
          `healthy` is `[].every(...)` while loading, i.e. true — so it claimed
          SIGNAL OK before hearing from a single store. `loading` withholds it. */}
      <StatusStrip
        lastSweepTime={
          overallLastSweepAt ? new Date(overallLastSweepAt).toLocaleTimeString('ro-RO') : PENDING
        }
        storeCount={storeHealths.length}
        healthy={healthy}
        loading={loading}
      />
      <NavBar active="stores" />

      <PageHeader
        title="Stores on watch"
        crumbCurrent="STORES"
        // "SWEEP EVERY 15 MIN" was here until 2026-08-05. It was wrong twice over:
        // it published the sweep cadence, which tells a shop what to rate-limit,
        // and 15 minutes was not the cadence anyway (scraper.yml runs `*/2 * * * *`).
        meta={
          loading
            ? `${PENDING} STORES MONITORED · CONTINUOUS SWEEP · ${PENDING} RESPONDING`
            : `${storeHealths.length} STORES MONITORED · CONTINUOUS SWEEP · ${respondingCount}/${storeHealths.length} RESPONDING`
        }
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
