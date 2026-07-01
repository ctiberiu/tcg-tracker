import { useState, useCallback, useEffect, useRef } from 'react'
import { useStores } from '../hooks/useStores'
import { supabase } from '../lib/supabase'
import { AppSidebar } from '../components/AppSidebar'
import { ManageEmails } from '../components/ManageEmails'
import type { Store, ScraperType, Product, ScrapeRun } from '../lib/types'

const SCRAPER_TYPES: { value: ScraperType; label: string }[] = [
  { value: 'pokemonia', label: 'Pokemonia (Gomag)' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'hobby_planet', label: 'Hobby-Planet (MerchantPro)' },
  { value: 'regatul_jocurilor', label: 'RegatulJocurilor (PrestaShop)' },
]

interface StoreFormData {
  name: string
  url: string
  scraper_type: ScraperType
  is_enabled: boolean
  in_stock_selector: string
  out_of_stock_selector: string
}

const EMPTY_FORM: StoreFormData = {
  name: '',
  url: '',
  scraper_type: 'shopify',
  is_enabled: true,
  in_stock_selector: '',
  out_of_stock_selector: '',
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
      }
      if (editingId) {
        await updateStore(editingId, payload)
      } else {
        await addStore(payload)
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
    <div className="min-h-screen bg-background flex">
      <AppSidebar activePage="admin" />

      {/* Main content */}
      <div className="flex-1 p-8 overflow-auto">
        <h1 className="font-headline font-black text-xl text-on-surface uppercase tracking-tight mb-8">
          TCG Tracker
        </h1>

        {/* Manage Emails — recipients of stock alerts */}
        <ManageEmails />

        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline text-2xl font-bold text-on-surface">
            Manage Stores
          </h2>
          <button
            onClick={openAdd}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary font-headline font-bold text-sm hover:bg-primary/90 transition-colors"
          >
            + Add Store
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-error/10 text-error text-sm mb-4">
            Failed to load stores: {error}
          </div>
        )}

        {loading && <p className="text-on-surface-variant text-sm">Loading stores...</p>}

        {/* Store form */}
        {showForm && (
          <div className="bg-surface-low rounded-xl p-6 mb-6">
            <h3 className="font-headline font-bold text-on-surface mb-4">
              {editingId ? 'Edit Store' : 'Add Store'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-on-surface-variant text-xs uppercase tracking-wider mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface-container text-on-surface text-sm outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Store name"
                />
              </div>
              <div>
                <label className="block text-on-surface-variant text-xs uppercase tracking-wider mb-1">URL</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface-container text-on-surface text-sm outline-none focus:ring-1 focus:ring-primary"
                  placeholder="https://store.ro/products"
                />
              </div>
              <div>
                <label className="block text-on-surface-variant text-xs uppercase tracking-wider mb-1">Scraper Type</label>
                <select
                  value={form.scraper_type}
                  onChange={(e) => setForm({ ...form, scraper_type: e.target.value as ScraperType })}
                  className="w-full px-3 py-2 rounded-lg bg-surface-container text-on-surface text-sm outline-none focus:ring-1 focus:ring-primary"
                >
                  {SCRAPER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3 pt-5">
                <input
                  type="checkbox"
                  id="is_enabled"
                  checked={form.is_enabled}
                  onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
                <label htmlFor="is_enabled" className="text-on-surface text-sm">Enabled</label>
              </div>
              <div>
                <label className="block text-on-surface-variant text-xs uppercase tracking-wider mb-1">In-Stock Selector (CSS)</label>
                <input
                  type="text"
                  value={form.in_stock_selector}
                  onChange={(e) => setForm({ ...form, in_stock_selector: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface-container text-on-surface text-sm outline-none focus:ring-1 focus:ring-primary"
                  placeholder='e.g. button[class*="add-to-cart"]'
                />
              </div>
              <div>
                <label className="block text-on-surface-variant text-xs uppercase tracking-wider mb-1">Out-of-Stock Selector (CSS)</label>
                <input
                  type="text"
                  value={form.out_of_stock_selector}
                  onChange={(e) => setForm({ ...form, out_of_stock_selector: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface-container text-on-surface text-sm outline-none focus:ring-1 focus:ring-primary"
                  placeholder='e.g. .out-of-stock, .sold-out'
                />
              </div>
            </div>
            {formError && (
              <p className="text-error text-sm mt-3">{formError}</p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary font-headline font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg bg-surface-high text-on-surface font-headline text-sm hover:bg-surface-highest transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Stores list */}
        {!loading && stores.length === 0 && (
          <p className="text-on-surface-variant text-sm">No stores configured yet.</p>
        )}

        <div className="space-y-3">
          {stores.map((store) => (
            <div
              key={store.id}
              className="bg-surface-low rounded-xl p-4 flex items-center gap-4"
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${store.is_enabled ? 'bg-tertiary' : 'bg-outline'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-headline font-bold text-on-surface text-sm">{store.name}</h3>
                  <span className="text-on-surface-variant text-xs px-2 py-0.5 rounded bg-surface-container">
                    {store.scraper_type}
                  </span>
                </div>
                <a
                  href={store.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-on-surface-variant text-xs truncate hover:text-primary transition-colors"
                >{store.url}</a>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Scrape result notification */}
                {scrapeResult?.storeId === store.id && scrapeResult.run.status === 'completed' && (
                  <span className="text-tertiary text-xs font-bold">
                    {scrapeResult.run.products_found} found, {scrapeResult.run.products_new} new
                  </span>
                )}
                {scrapeResult?.storeId === store.id && scrapeResult.run.status === 'failed' && (
                  <span className="text-error text-xs">Scrape failed</span>
                )}
                <button
                  onClick={() => handleScrapeNow(store)}
                  disabled={scrapingId === store.id}
                  title="Scrape now"
                  className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  {scrapingId === store.id ? 'Scraping...' : 'Scrape Now'}
                </button>
                <button
                  onClick={() => openSidebar(store.id)}
                  title="View items"
                  className="px-3 py-1.5 rounded-lg bg-surface-high text-on-surface text-xs font-bold hover:bg-surface-highest transition-colors"
                >
                  View Items
                </button>
                <button
                  onClick={() => openEdit(store)}
                  title="Edit"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-high transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(store.id, store.name)}
                  title="Delete"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-high hover:text-error transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <div className="w-[400px] min-h-screen bg-surface-low border-l border-outline-variant shrink-0 flex flex-col">
          <div className="p-4 flex items-center justify-between border-b border-outline-variant">
            <h3 className="font-headline font-bold text-on-surface text-sm">
              {sidebarStore?.name ?? 'Store'} Items
            </h3>
            <button
              onClick={() => setSidebarStoreId(null)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-high transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {sidebarLoading && <p className="text-on-surface-variant text-sm">Loading...</p>}
            {!sidebarLoading && sidebarProducts.length === 0 && (
              <p className="text-on-surface-variant text-sm">No products scraped yet.</p>
            )}
            {sidebarProducts.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-surface-container rounded-lg p-3 hover:ring-1 hover:ring-primary/50 transition-all"
              >
                <div className="flex gap-3">
                  {p.image_url && (
                    <img src={p.image_url} alt={p.title} className="w-14 h-14 rounded object-contain bg-surface-high shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-on-surface text-xs font-bold leading-tight line-clamp-2">{p.title}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-primary text-xs font-bold">
                        {p.price != null ? `${p.price.toFixed(2)} RON` : 'N/A'}
                      </span>
                      {!p.in_stock && (
                        <span className="text-error text-xs">Out of stock</span>
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
