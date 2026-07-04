// Pure, side-effect-free helpers for the FastSimon / InstantSearch+ JSON search
// API (used by ozone.ro). Kept separate from scraper.js so the API-item → product
// mapping is unit-testable against a captured real API response, with no live
// fetch and no browser.
//
// Why this exists: ozone.ro's search page (`/instantsearchplus/result/`) is a
// client-side FastSimon widget — the server HTML contains ZERO product markup;
// every product is injected by JS after an async call to api.fastsimon.com.
// Scraping that JS-rendered DOM raced the render and intermittently saw 0
// products, which tripped the scraper's auto-disable. We instead hit the same
// JSON endpoint the page itself calls (deterministic, no render wait) — the same
// principle as the Shopify `/products.json` path in scraper.js.

/** FastSimon account identifiers for ozone.ro (stable per-store config, taken from the live page). */
export const OZONE_FASTSIMON = { uuid: '71de66ee-d2e2-4de2-b0bd-f51e3f0ee99e', storeId: '1' };

/**
 * Build the FastSimon full-text-search endpoint URL the ozone.ro widget uses.
 * @param {{ uuid: string, storeId: string|number, q: string, page?: number, perPage?: number, sortBy?: string }} opts
 * @returns {string}
 */
export function buildFastSimonSearchUrl({ uuid, storeId, q, page = 1, perPage = 50, sortBy = 'relevency' }) {
  const params = new URLSearchParams({
    request_source: 'v-next',
    src: 'v-next',
    UUID: uuid,
    store_id: String(storeId),
    api_type: 'json',
    facets_required: '0',
    products_per_page: String(perPage),
    narrow: '[]',
    q: q ?? '',
    page_num: String(page),
    sort_by: sortBy,
    with_product_attributes: 'true',
  });
  return `https://api.fastsimon.com/full_text_search?${params.toString()}`;
}

// Availability is exposed through a localized product attribute (key like
// "[общи] ozone наличност", value "În depozit" / "Epuizat"). Default to in-stock
// when no availability attribute is present — parity with the previous scraper's
// `?? true`, and consistent with only in-stock results normally being returned.
const OOS_RE = /epuizat|indisponibil|stoc epuizat|out of stock|sold\s*out/i;
const INSTOCK_RE = /[îi]n depozit|disponibil|in stock/i;

/** @param {any} item @returns {boolean} */
export function fastSimonItemInStock(item) {
  const attrs = Array.isArray(item?.att) ? item.att : [];
  for (const entry of attrs) {
    const key = String(entry?.[0] ?? '');
    if (!/nali[čc]nost|наличност|depozit|stoc|availab/i.test(key)) continue;
    const vals = entry?.[1];
    const text = Array.isArray(vals) ? vals.join(' ') : String(vals ?? '');
    if (OOS_RE.test(text)) return false;
    if (INSTOCK_RE.test(text)) return true;
  }
  return true;
}

/**
 * Map one FastSimon result item to the scraper's product shape.
 * Fields: `l` label/title, `u` url, `p`/`p_min`/`p_max` price, `t` image.
 * @returns {object|null} null when the item lacks a usable title or url.
 */
export function parseFastSimonItem(item, { storeName, storeId }) {
  const title = typeof item?.l === 'string' ? item.l.trim() : '';
  const url = typeof item?.u === 'string' ? item.u.trim() : '';
  if (!title || !url) return null;

  // Variant products can leave `p` empty and carry a range in p_min/p_max.
  const price = [item?.p, item?.p_min, item?.p_max]
    .map((x) => parseFloat(String(x ?? '').replace(',', '.')))
    .find((n) => Number.isFinite(n));

  const image = (typeof item?.t === 'string' && item.t.trim())
    || (typeof item?.t2 === 'string' && item.t2.trim())
    || null;

  return {
    title,
    price: Number.isFinite(price) ? price : null,
    url,
    image_url: image,
    store_name: storeName,
    store_id: storeId,
    in_stock: fastSimonItemInStock(item),
  };
}

/**
 * Map a full FastSimon `full_text_search` JSON response to products (deduped by url).
 * @param {any} json parsed API response ({ items: [...] })
 * @param {{ storeName: string, storeId: any }} ctx
 * @returns {object[]}
 */
export function parseFastSimonResponse(json, ctx) {
  const items = Array.isArray(json?.items) ? json.items : [];
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const product = parseFastSimonItem(it, ctx);
    if (!product || seen.has(product.url)) continue;
    seen.add(product.url);
    out.push(product);
  }
  return out;
}
