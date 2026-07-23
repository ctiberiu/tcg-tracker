import { useState, useCallback, useEffect, useRef } from 'react'
import { useStores } from '../hooks/useStores'
import { supabase } from '../lib/supabase'
import { AppSidebar } from '../components/AppSidebar'
import { ManageEmails } from '../components/ManageEmails'
import {
  StatusDot,
  CtaButton,
  fieldStyle,
  labelStyle,
  panelStyle,
  rowStyle,
  sectionTitleStyle,
  errorBoxStyle,
  iconButtonStyle,
} from '../components/packradar'
import { GAMES, type GameKey } from '../components/packradar'
import type { Store, ScraperType, Product, ScrapeRun } from '../lib/types'

const SCRAPER_TYPES: { value: ScraperType; label: string }[] = [
  { value: 'pokemonia', label: 'Gomag' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'hobby_planet', label: 'Hobby-Planet (MerchantPro)' },
  { value: 'regatul_jocurilor', label: 'RegatulJocurilor (PrestaShop)' },
  { value: 'magento', label: 'Magento' },
  { value: 'opencart', label: 'OpenCart' },
  { value: 'krit', label: 'Krit (Next.js)' },
  { value: 'smyk', label: 'Smyk (custom)' },
  { value: 'ozone', label: 'Ozone (FastSimon)' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'woocommerce_api', label: 'WooCommerce (Store API)' },
  { value: 'flamey_api', label: 'Flamey (bespoke API)' },
  { value: 'secretcards_api', label: 'SecretCards (Laravel/Inertia)' },
  { value: 'lumea_jocurilor', label: 'LumeaJocurilor (custom)' },
  { value: 'raijucarii', label: 'Raijucarii (custom)' },
  { value: 'tulli', label: 'Tulli (custom)' },
  { value: 'bebetei', label: 'Bebetei (custom)' },
  { value: 'carturesti', label: 'Carturesti (AngularJS)' },
  { value: 'foon', label: 'Foon (custom)' },
  { value: 'pokemania', label: 'Pokemania (cdnmp.net)' },
]

const GAME_OPTIONS = Object.values(GAMES)

interface StoreFormData {
  name: string
  url: string
  scraper_type: ScraperType
  is_enabled: boolean
  in_stock_selector: string
  out_of_stock_selector: string
  game: GameKey
}

const EMPTY_FORM: StoreFormData = {
  name: '',
  url: '',
  scraper_type: 'shopify',
  is_enabled: true,
  in_stock_selector: '',
  out_of_stock_selector: '',
  game: 'pokemon',
}

export function AdminPage() {
  const { stores, loading, error, addStore, updateStore, deleteStore } = useStores()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<StoreFormData>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Scrape state
  const [scrapingId, setScrapingId] = useState<string | null>(null)
  const [scrapeResult, setScrapeResult] = useState<{ storeId: string; run: ScrapeRun } | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
    }
  }, [])

  // Sidebar state
  const [sidebarStoreId, setSidebarStoreId] = useState<string | null>(null)
  const [sidebarProducts, setSidebarProducts] = useState<Product[]>([])
  const [sidebarLoading, setSidebarLoading] = useState(false)

  const openAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (store: Store) => {
    setEditingId(store.id)
    setForm({
      name: store.name,
      url: store.url,
      scraper_type: store.scraper_type,
      is_enabled: store.is_enabled,
      in_stock_selector: store.in_stock_selector ?? '',
      out_of_stock_selector: store.out_of_stock_selector ?? '',
      game: store.game,
    })
    setFormError(null)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      setFormError('Name and URL are required')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        name: form.name.trim(),
        url: form.url.trim(),
        scraper_type: form.scraper_type,
        is_enabled: form.is_enabled,
        in_stock_selector: form.in_stock_selector.trim() || null,
        out_of_stock_selector: form.out_of_stock_selector.trim() || null,
        game: form.game,
      }
      if (editingId) {
        await updateStore(editingId, payload)
      } else {
        await addStore({ ...payload, is_flagged: false, flagged_at: null })
      }
      setShowForm(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete store "${name}"? This cannot be undone.`)) return
    try {
      await deleteStore(id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleScrapeNow = async (store: Store) => {
    // Clear any previous polling
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)

    setScrapingId(store.id)
    setScrapeResult(null)
    try {
      // Create a pending scrape run
      const { data: run, error: runError } = await supabase
        .from('scrape_runs')
        .insert({ store_id: store.id, status: 'pending' })
        .select()
        .single()
      if (runError) throw new Error(runError.message)

      // Trigger GitHub Actions via Supabase Edge Function
      const { error: fnError } = await supabase.functions.invoke('trigger-scrape', {
        body: { store_id: store.id, run_id: run.id },
      })
      if (fnError) {
        // Update run as failed
        await supabase.from('scrape_runs').update({ status: 'failed', error_message: fnError.message }).eq('id', run.id)
        throw new Error(fnError.message)
      }

      // Poll for completion
      pollIntervalRef.current = setInterval(async () => {
        const { data } = await supabase
          .from('scrape_runs')
          .select('*')
          .eq('id', run.id)
          .single()
        if (data && (data.status === 'completed' || data.status === 'failed')) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
          pollIntervalRef.current = null
          pollTimeoutRef.current = null
          setScrapingId(null)
          setScrapeResult({ storeId: store.id, run: data as ScrapeRun })
        }
      }, 5000)

      // Timeout after 5 minutes
      pollTimeoutRef.current = setTimeout(() => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
        pollTimeoutRef.current = null
        setScrapingId(null)
      }, 300000)
    } catch (err) {
      setScrapingId(null)
      alert(err instanceof Error ? err.message : 'Failed to trigger scrape')
    }
  }

  const openSidebar = useCallback(async (storeId: string) => {
    setSidebarStoreId(storeId)
    setSidebarLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .order('first_seen', { ascending: false })
      .range(0, 99)
    setSidebarProducts((data as Product[]) ?? [])
    setSidebarLoading(false)
  }, [])

  // If scrape just completed for a store and sidebar is open for that store, refresh
  useEffect(() => {
    if (scrapeResult && sidebarStoreId === scrapeResult.storeId) {
      openSidebar(scrapeResult.storeId)
    }
  }, [scrapeResult, sidebarStoreId, openSidebar])

  const sidebarStore = stores.find((s) => s.id === sidebarStoreId)

  return (
    <div className="packradar" style={{ minHeight: '100vh', display: 'flex' }}>
      <AppSidebar activePage="admin" />

      {/* Main content */}
      <div style={{ flex: 1, padding: 32, overflow: 'auto' }}>
        <div style={{ fontSize: 10.5, color: 'var(--pr-signal)', letterSpacing: 2, marginBottom: 24 }}>
          /// PACKRADAR OPERATOR CONSOLE
        </div>

        {/* Manage Emails — recipients of stock alerts */}
        <ManageEmails />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={sectionTitleStyle}>Manage Stores</h2>
          <CtaButton variant="solid" size="sm" onClick={openAdd}>+ ADD STORE</CtaButton>
        </div>

        {error && (
          <div style={{ ...errorBoxStyle, marginBottom: 16 }}>Failed to load stores: {error}</div>
        )}

        {loading && <p style={{ color: 'var(--pr-text-dim)', fontSize: 13 }}>Loading stores...</p>}

        {/* Store form */}
        {showForm && (
          <div style={{ ...panelStyle, marginBottom: 20 }}>
            <h3 style={{ ...sectionTitleStyle, fontSize: 16, marginBottom: 16 }}>
              {editingId ? 'Edit Store' : 'Add Store'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={fieldStyle}
                  placeholder="Store name"
                />
              </div>
              <div>
                <label style={labelStyle}>URL</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  style={fieldStyle}
                  placeholder="https://store.ro/products"
                />
              </div>
              <div>
                <label style={labelStyle}>Scraper Type</label>
                <select
                  value={form.scraper_type}
                  onChange={(e) => setForm({ ...form, scraper_type: e.target.value as ScraperType })}
                  style={fieldStyle}
                >
                  {SCRAPER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Game</label>
                <select
                  value={form.game}
                  onChange={(e) => setForm({ ...form, game: e.target.value as GameKey })}
                  style={fieldStyle}
                >
                  {GAME_OPTIONS.map((g) => (
                    <option key={g.key} value={g.key}>{g.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 20 }}>
                <input
                  type="checkbox"
                  id="is_enabled"
                  checked={form.is_enabled}
                  onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
                  style={{ width: 16, height: 16, accentColor: 'var(--pr-signal)' }}
                />
                <label htmlFor="is_enabled" style={{ color: 'var(--pr-text-mid)', fontSize: 13 }}>Enabled</label>
              </div>
              <div>
                <label style={labelStyle}>In-Stock Selector (CSS)</label>
                <input
                  type="text"
                  value={form.in_stock_selector}
                  onChange={(e) => setForm({ ...form, in_stock_selector: e.target.value })}
                  style={fieldStyle}
                  placeholder='e.g. button[class*="add-to-cart"]'
                />
              </div>
              <div>
                <label style={labelStyle}>Out-of-Stock Selector (CSS)</label>
                <input
                  type="text"
                  value={form.out_of_stock_selector}
                  onChange={(e) => setForm({ ...form, out_of_stock_selector: e.target.value })}
                  style={fieldStyle}
                  placeholder='e.g. .out-of-stock, .sold-out'
                />
              </div>
            </div>
            {formError && (
              <p style={{ color: 'var(--pr-status-gone)', fontSize: 12.5, marginTop: 12 }}>{formError}</p>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <CtaButton variant="solid" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'SAVING…' : 'SAVE'}
              </CtaButton>
              <CtaButton variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                CANCEL
              </CtaButton>
            </div>
          </div>
        )}

        {/* Stores list */}
        {!loading && stores.length === 0 && (
          <p style={{ color: 'var(--pr-text-dim)', fontSize: 13 }}>No stores configured yet.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stores.map((store) => (
            <div key={store.id} style={rowStyle}>
              <StatusDot color={store.is_enabled ? 'var(--pr-signal)' : 'var(--pr-text-dim)'} size={8} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ fontFamily: 'var(--pr-font-display)', fontWeight: 700, fontSize: 14, color: 'var(--pr-text-bright)' }}>
                    {store.name}
                  </h3>
                  <span style={{ fontSize: 9, color: 'var(--pr-text-dim)', letterSpacing: 1, padding: '2px 6px', border: '1px solid var(--pr-border)' }}>
                    {store.scraper_type}
                  </span>
                  <span style={{ fontSize: 9, color: GAMES[store.game].color, letterSpacing: 1, padding: '2px 6px', border: `1px solid ${GAMES[store.game].dim}` }}>
                    {GAMES[store.game].label}
                  </span>
                  {store.is_flagged && (
                    <span
                      title={store.flagged_at ? `Flagged since ${new Date(store.flagged_at).toLocaleString('ro-RO')} — auto-disables after 12h if still failing` : 'Flagged'}
                      style={{ fontSize: 9, color: 'var(--pr-status-preorder)', letterSpacing: 1, padding: '2px 6px', border: '1px solid var(--pr-status-preorder)' }}
                    >
                      ⚑ FLAGGED
                    </span>
                  )}
                </div>
                <a
                  href={store.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontSize: 11, color: 'var(--pr-text-dim)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >{store.url}</a>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {/* Scrape result notification */}
                {scrapeResult?.storeId === store.id && scrapeResult.run.status === 'completed' && (
                  <span style={{ color: 'var(--pr-signal)', fontSize: 11, fontWeight: 700 }}>
                    {scrapeResult.run.products_found} found, {scrapeResult.run.products_new} new
                  </span>
                )}
                {scrapeResult?.storeId === store.id && scrapeResult.run.status === 'failed' && (
                  <span style={{ color: 'var(--pr-status-gone)', fontSize: 11 }}>Scrape failed</span>
                )}
                <CtaButton variant="ghost" size="sm" onClick={() => handleScrapeNow(store)} disabled={scrapingId === store.id}>
                  {scrapingId === store.id ? 'SCRAPING…' : 'SCRAPE NOW'}
                </CtaButton>
                <CtaButton variant="ghost" size="sm" onClick={() => openSidebar(store.id)}>
                  VIEW ITEMS
                </CtaButton>
                <button onClick={() => openEdit(store)} title="Edit" style={iconButtonStyle}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button onClick={() => handleDelete(store.id, store.name)} title="Delete" style={iconButtonStyle}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Items sidebar */}
      {sidebarStoreId && (
        <div style={{ width: 400, minHeight: '100vh', background: 'var(--pr-bg-panel)', borderLeft: '1px solid var(--pr-border)', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--pr-border)' }}>
            <h3 style={{ fontFamily: 'var(--pr-font-display)', fontWeight: 700, fontSize: 14, color: 'var(--pr-text-bright)' }}>
              {sidebarStore?.name ?? 'Store'} Items
            </h3>
            <button onClick={() => setSidebarStoreId(null)} style={iconButtonStyle}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sidebarLoading && <p style={{ color: 'var(--pr-text-dim)', fontSize: 13 }}>Loading...</p>}
            {!sidebarLoading && sidebarProducts.length === 0 && (
              <p style={{ color: 'var(--pr-text-dim)', fontSize: 13 }}>No products scraped yet.</p>
            )}
            {sidebarProducts.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'block', border: '1px solid var(--pr-border)', background: 'var(--pr-bg)', padding: 10 }}
              >
                <div style={{ display: 'flex', gap: 10 }}>
                  {p.image_url && (
                    <img src={p.image_url} alt={p.title} style={{ width: 56, height: 56, objectFit: 'contain', background: '#fff', flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ color: 'var(--pr-text-bright)', fontSize: 12, fontWeight: 700, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {p.title}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ color: 'var(--pr-signal)', fontSize: 12, fontWeight: 700 }}>
                        {p.price != null ? `${p.price.toFixed(2)} RON` : 'N/A'}
                      </span>
                      {!p.in_stock && (
                        <span style={{ color: 'var(--pr-status-gone)', fontSize: 11 }}>Out of stock</span>
                      )}
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
