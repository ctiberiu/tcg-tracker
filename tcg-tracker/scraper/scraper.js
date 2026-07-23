import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'node:url';
import {
  BROWSER_UA,
  detectChallengeText,
  classifyOutcome,
  applyFailureOutcome,
} from './block-detection.js';
import { isStoreDue } from './schedule.js';
import { OZONE_FASTSIMON, buildFastSimonSearchUrl, parseFastSimonResponse } from './fastsimon.js';

chromium.use(StealthPlugin());

/**
 * Initialize Supabase client from environment variables.
 * Uses SUPABASE_URL and SUPABASE_KEY (service role key for inserts).
 */
function initSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_KEY environment variables'
    );
  }

  return createClient(url, key);
}

/**
 * Map scraper_type strings to scrape functions.
 */
const SCRAPER_MAP = {
  pokemonia: scrapePokemonia,
  gomag: scrapePokemonia, // alias — Gomag platform (CardXTCG, RamCards, etc.)
  pokemania: scrapePokemania, // pokemania.ro — distinct cdnmp.net platform (NOT Gomag)
  shopify: scrapeShopify,
  hobby_planet: scrapeHobbyPlanet,
  regatul_jocurilor: scrapeRegatulJocurilor,
  magento: scrapeMagento,
  krit: scrapeKrit,
  smyk: scrapeSmyk,
  ozone: scrapeOzone,
  woocommerce: scrapeWooCommerce,
  woocommerce_api: scrapeDexHitApi, // never actually called via this map — fetchStoreData
                                     // special-cases it (like shopify/ozone) to skip the
                                     // page load; present here only so the "unknown
                                     // scraper type" guard doesn't reject it.
  flamey_api: scrapeFlameyApi, // same as woocommerce_api above — special-cased in fetchStoreData
  secretcards_api: scrapeSecretCardsApi, // same as woocommerce_api above — special-cased in fetchStoreData
  lumea_jocurilor: scrapeLumeaJocurilor,
  raijucarii: scrapeRaijucarii,
  tulli: scrapeTulli,
  bebetei: scrapeBebetei,
  carturesti: scrapeCarturesti,
  foon: scrapeFoon,
  opencart: scrapeOpenCart,
};

/**
 * Fetch stores from Supabase. If SCRAPE_STORE_ID is set, fetch only that store.
 */
async function fetchStores(supabase) {
  const storeId = process.env.SCRAPE_STORE_ID;

  // A single-store manual trigger always runs regardless of timing.
  if (storeId) {
    const { data, error } = await supabase.from('stores').select('*').eq('id', storeId);
    if (error) throw new Error(`Failed to fetch stores: ${error.message}`);
    return data ?? [];
  }

  const { data, error } = await supabase.from('stores').select('*').eq('is_enabled', true);
  if (error) throw new Error(`Failed to fetch stores: ${error.message}`);

  // Due-based scheduling: only scrape stores that are actually due (never scraped,
  // or past their own check_interval_minutes). Filtered client-side — the store
  // count is small and an interval SQL expression is awkward in the JS builder.
  const now = Date.now();
  const due = (data ?? []).filter((s) => isStoreDue(s, now));
  console.log(`Stores: ${data?.length ?? 0} enabled, ${due.length} due this run`);
  return due;
}

/**
 * Pokemonia.ro — Gomag platform
 * Products use [data-product-id] containers.
 */
async function scrapePokemonia(page, store) {
  try {
    await page.waitForSelector('[data-product-id]', { timeout: 15000 });
  } catch {
    // Was uncaught before, which threw all the way up to scrapeAll's per-store
    // try/catch → 'transient' outcome → never counts toward auto-disable. That
    // let a persistently-blocked store (e.g. a Cloudflare challenge) sit at
    // 0 products forever while still showing as "healthy". Returning [] here
    // instead makes it classify as a real block, like every other scraper.
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
  }

  return page.evaluate(({ storeName, storeId }) => {
    function normalizeImageUrl(src, base) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('data:')) return null;
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) return base + src;
      if (src.startsWith('http')) return src;
      return base + '/' + src;
    }
    const baseUrl = window.location.origin;
    const items = document.querySelectorAll('[data-product-id]');
    return Array.from(items).map((el) => {
      const id = el.dataset.productId;
      const titleEl = el.querySelector(`a.title[class*="_productUrl_${id}"], a[class*="_productUrl_${id}"]:not([class*="_productMainUrl_"]), a[href*=".html"]:not([class*="image"])`);
      const priceEl = el.querySelector(`[class*="price"][class*="${id}"], [class*="price"]`);
      const imgEl = el.querySelector('img[data-lazy-src], img[data-src], img[src]');
      const linkEl = titleEl || el.querySelector(`a[href*=".html"]`);

      const priceText = priceEl?.textContent?.trim() ?? '';
      const priceMatch = priceText.match(/([\d.,]+)\s*(RON|lei)/i);
      let price = null;
      if (priceMatch) {
        // Locale-agnostic: whichever separator appears LAST is the decimal point.
        price = parseFloat(
          priceMatch[1].lastIndexOf(',') > priceMatch[1].lastIndexOf('.')
            ? priceMatch[1].replace(/\./g, '').replace(',', '.')
            : priceMatch[1].replace(/,/g, ''),
        );
      }

      const imgSrc = imgEl?.getAttribute('data-lazy-src') ?? imgEl?.getAttribute('data-src') ?? imgEl?.getAttribute('src');

      // Out-of-stock on Gomag is shown as: .stock-status.unavailable, an
      // "Indisponibil"/out-of-stock button, OR (when sold out) a stock-alert
      // button ("Alerta stoc", class *stockAlert*) replacing add-to-cart.
      const unavailable = el.querySelector(
        '.stock-status.unavailable, .btn-outOfStock, [class*="stockAlert"]'
      );
      const epuizat = Array.from(el.querySelectorAll('span, div, button, a')).some((s) => {
        const t = s.textContent?.trim();
        return t === 'Stoc epuizat' || t === 'Indisponibil' || t === 'Alerta stoc';
      });
      const in_stock = !unavailable && !epuizat;

      return {
        title: titleEl?.textContent?.trim() ?? null,
        price,
        url: linkEl?.href ?? null,
        image_url: normalizeImageUrl(imgSrc, baseUrl),
        store_name: storeName,
        store_id: storeId,
        in_stock,
      };
    }).filter((p) => p.title && p.url);
  }, { storeName: store.name, storeId: store.id });
}

/** Pagination safety ceiling + pacing for pokemania.ro (same values as the other
 *  paginated scrapers; kept local so this scraper is self-contained). */
const POKEMANIA_MAX_PAGES = 30;
const POKEMANIA_PAGE_DELAY_MS = 500;

/**
 * Pokemania.ro — NOT Gomag (that's scrapePokemonia). A distinct platform (cdnmp.net
 * CDN) whose listing cards are `.product.product--grid`, with the title/URL in
 * `.product__name`, RO-format price in `.product__info--price-gross`, and a
 * lazy-loaded image whose real URL is in `data-src` (`src` is a no_image.svg
 * placeholder until scrolled into view). Listings paginate via `/pN` URLs; we walk
 * every page by following the `.pagination__arrow--next` link (disabled/absent on
 * the last page), deduping by product URL — same pattern as scrapeWooCommerce.
 *
 * The store row was misconfigured as scraper_type 'pokemonia' (Gomag), whose
 * `[data-product-id]` marker never appears here — and scrapePokemonia has no
 * try/catch, so it threw uncaught → 'transient' → silent failure every run. This
 * function wraps the initial wait in try/catch so it can never fail silently again.
 */
async function scrapePokemania(page, store) {
  async function extractCurrentPage() {
    try {
      await page.waitForSelector('.product.product--grid', { timeout: 15000 });
    } catch {
      return null;
    }

    // Images/products are lazy-loaded on scroll (data-src → src as they enter view).
    await page.evaluate(async () => {
      for (let i = 0; i < 4; i++) {
        window.scrollBy(0, 1500);
        await new Promise((r) => setTimeout(r, 400));
      }
    });

    return page.evaluate(({ storeName, storeId }) => {
      const cards = document.querySelectorAll('.product.product--grid');
      const results = [];
      const seen = new Set();

      for (const card of cards) {
        const nameEl = card.querySelector('.product__name');
        const title = nameEl?.textContent?.trim();
        const url = nameEl?.href;
        if (!title || !url || seen.has(url)) continue;
        seen.add(url);

        let price = null;
        const priceEl = card.querySelector('.product__info--price-gross, [class*="price-gross"]');
        if (priceEl) {
          // RO format: thousands dot, decimal comma — "1.599,90 RON" → 1599.90
          const match = priceEl.textContent?.trim()?.match(/([\d.,]+)\s*(RON|lei|LEI)/i);
          if (match) {
            // Locale-agnostic: whichever separator appears LAST is the decimal
            // point (LibHumanitas uses "101.58", others use RO "101,58" — a
            // fixed "dot=thousands" assumption silently produced 10158).
            price = parseFloat(
              match[1].lastIndexOf(',') > match[1].lastIndexOf('.')
                ? match[1].replace(/\./g, '').replace(',', '.')
                : match[1].replace(/,/g, ''),
            );
          }
        }

        // Lazy-loaded: real URL is in data-src; `src` holds a no_image.svg placeholder.
        const imgEl = card.querySelector('.grid-image__image, img');
        const rawImg = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('src') || '';
        const image_url = rawImg && !/no_image/i.test(rawImg) ? rawImg : null;

        // No explicit out-of-stock signal was found on the listing (OOS items appear
        // to be omitted). Default to in-stock, but honor an explicit OOS marker if
        // one ever appears — matching the "no signal → assume in stock" convention.
        const outOfStock = card.classList.contains('product--out-of-stock')
          || card.querySelector('[class*="out-of-stock"], [class*="sold-out"], [class*="epuizat"]') !== null;

        results.push({
          title,
          price,
          url,
          image_url,
          store_name: storeName,
          store_id: storeId,
          in_stock: !outOfStock,
        });
      }

      return results;
    }, { storeName: store.name, storeId: store.id });
  }

  // The actual "next page" href — null when the arrow is disabled/absent (last page).
  function readNextHref() {
    return page.evaluate(() => {
      const link = document.querySelector('.pagination__arrow--next a[href]');
      return link ? link.href : null;
    });
  }

  const firstPage = await extractCurrentPage();
  if (firstPage === null) {
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
  }

  const results = [];
  const seen = new Set();
  const merge = (products) => {
    for (const p of products) {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      results.push(p);
    }
  };
  merge(firstPage);

  let nextHref = await readNextHref();
  let pagesVisited = 1;
  while (nextHref && pagesVisited < POKEMANIA_MAX_PAGES) {
    await new Promise((r) => setTimeout(r, POKEMANIA_PAGE_DELAY_MS));
    await page.goto(nextHref, { waitUntil: 'load', timeout: 30000 });
    let pageProducts = await extractCurrentPage();
    if (pageProducts === null) {
      // A link we followed FROM the previous page (proof this page exists)
      // failed to render — not "we reached the end". Silently treating this
      // the same as a real last page used to return a partial catalog (e.g.
      // page 1-2 of 3) as if it were the whole thing; the staleness sweep
      // then marked the missing page's products out-of-stock, and the next
      // run that DID get all pages "restocked" them — a false restock alert
      // for ~half the catalog, repeatedly. One retry, then fail the whole
      // store attempt (→ transient, no stock corruption) rather than lie.
      await new Promise((r) => setTimeout(r, POKEMANIA_PAGE_DELAY_MS));
      await page.goto(nextHref, { waitUntil: 'load', timeout: 30000 });
      pageProducts = await extractCurrentPage();
    }
    pagesVisited++;
    if (pageProducts === null) {
      throw new Error(`page ${pagesVisited} failed to render after a retry — aborting instead of returning a partial catalog`);
    }
    merge(pageProducts);
    nextHref = await readNextHref();
  }

  if (pagesVisited >= POKEMANIA_MAX_PAGES && nextHref) {
    console.warn(`  ${store.name}: hit the ${POKEMANIA_MAX_PAGES}-page cap — stopping pagination`);
  }
  if (pagesVisited > 1) {
    console.log(`  ${store.name}: scraped ${pagesVisited} page(s), ${results.length} unique products`);
  }
  return results;
}

/**
 * Shopify stores (RedGoblin, TCGarena, Guildhall)
 * Uses the Shopify JSON API (/products.json) for reliable product data and stock status.
 */
async function scrapeShopify(_page, store) {
  const baseUrl = new URL(store.url).origin;
  const jsonUrl = store.url.replace(/\?.*$/, '').replace(/\/$/, '') + '/products.json?limit=250';

  // No Playwright page — the scraper skips the wasted page load for Shopify and
  // does its own JSON fetch. Report the fetch's OWN status + challenge signal so
  // block-detection still works. A network/timeout error is left to throw → the
  // caller classifies it as a transient failure (not a block).
  const res = await fetch(jsonUrl, {
    headers: { 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(30000),
  });
  const status = res.status;
  const text = await res.text();
  const challenged = detectChallengeText(text);

  if (!res.ok) {
    console.log(`  ${store.name}: Shopify JSON API HTTP ${status}`);
    return { products: [], status, challenged };
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // 200 but not JSON → an HTML interstitial/challenge sitting in front of the API.
    console.log(`  ${store.name}: Shopify JSON API returned non-JSON (likely a block/interstitial)`);
    return { products: [], status, challenged: true };
  }

  const products = (data.products ?? []).map((product) => ({
    title: product.title,
    price: product.variants?.[0]?.price ? parseFloat(product.variants[0].price) : null,
    url: baseUrl + '/products/' + product.handle,
    image_url: product.images?.[0]?.src ?? null,
    store_name: store.name,
    store_id: store.id,
    in_stock: product.variants?.some((v) => v.available) ?? false,
  }));
  return { products, status, challenged };
}

/**
 * Hobby-Planet.ro — MerchantPro platform
 * Product cards: div.product containing grid-image link and product__data section.
 */
async function scrapeHobbyPlanet(page, store) {
  const noResults = await page.$('text=nu a intors niciun rezultat');
  if (noResults) {
    console.log(`  ${store.name}: No Pokemon products found in catalog`);
    return [];
  }

  await page.waitForSelector('a[href*="/cumpara/"]', { timeout: 15000 });

  return page.evaluate(({ storeName, storeId }) => {
    function normalizeImageUrl(src, base) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('data:')) return null;
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) return base + src;
      if (src.startsWith('http')) return src;
      return base + '/' + src;
    }
    const baseUrl = window.location.origin;
    // Each product is a div.product containing both image and data sections
    const cards = document.querySelectorAll('div.product');
    const seen = new Set();
    const results = [];

    for (const card of cards) {
      const link = card.querySelector('a[href*="/cumpara/"]');
      if (!link) continue;

      const url = link.href;
      if (seen.has(url)) continue;
      seen.add(url);

      // Title: product__name link (text-only, not the image link)
      const titleEl = card.querySelector('a.product__name');
      const title = titleEl?.textContent?.trim() ?? link.getAttribute('title') ?? link.querySelector('img')?.alt ?? null;

      // Price: first span inside price-gross container
      let price = null;
      const priceContainer = card.querySelector('[class*="price-gross"]');
      if (priceContainer) {
        const match = priceContainer.textContent?.trim()?.match(/([\d.,]+)\s*RON/i);
        if (match) {
          // Locale-agnostic: whichever separator appears LAST is the decimal
          // point (LibHumanitas uses "101.58", others use RO "101,58" — a
          // fixed "dot=thousands" assumption silently produced 10158).
          price = parseFloat(
            match[1].lastIndexOf(',') > match[1].lastIndexOf('.')
              ? match[1].replace(/\./g, '').replace(',', '.')
              : match[1].replace(/,/g, ''),
          );
        }
      }

      // Image: prefer data-src (lazy) inside the image link, fall back to src
      const imgEl = link.querySelector('img[data-src]') ?? link.querySelector('img');
      const imgSrc = imgEl?.getAttribute('data-src') ?? imgEl?.getAttribute('src');

      // In-stock: add-to-cart link present (out-of-stock items have no cart button)
      const in_stock = !!card.querySelector('a[data-cart-add], a[class*="add-to-cart"]');

      if (title && url) {
        results.push({
          title,
          price,
          url,
          image_url: normalizeImageUrl(imgSrc, baseUrl),
          store_name: storeName,
          store_id: storeId,
          in_stock,
        });
      }
    }

    return results;
  }, { storeName: store.name, storeId: store.id });
}

/**
 * RegatulJocurilor.ro — PrestaShop platform
 * Only scrapes actual search result rows (li.product_item), not featured sections.
 * Filters to Pokemon TCG products only (excludes backpacks, toys, etc.).
 */
async function scrapeRegatulJocurilor(page, store) {
  for (const label of ['Acceptă', 'Accept', 'Sunt de acord', 'De acord', 'OK']) {
    try {
      await page.getByRole('button', { name: label }).click({ timeout: 2000 });
      break;
    } catch { /* try next */ }
  }

  try {
    await page.waitForSelector('.product-miniature', { timeout: 15000 });
  } catch {
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
  }

  return page.evaluate(({ storeName, storeId }) => {
    function normalizeImageUrl(src, base) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('data:')) return null;
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) return base + src;
      if (src.startsWith('http')) return src;
      return base + '/' + src;
    }
    const baseUrl = 'https://regatuljocurilor.ro';
    const items = document.querySelectorAll('.product-miniature');
    const results = [];
    const seen = new Set();

    for (const item of items) {
      const titleEl = item.querySelector('.product-title a, h2 a, h3 a');
      const linkEl = titleEl ?? item.querySelector('a.thumbnail, a.product-thumbnail');
      const title = titleEl?.textContent?.trim();
      if (!title || !linkEl) continue;

      let url = linkEl.getAttribute('href');
      if (url && url.startsWith('/')) url = baseUrl + url;
      if (!url || seen.has(url)) continue;
      seen.add(url);

      let price = null;
      const priceEl = item.querySelector('.product-price-and-shipping .price, .price, [class*="price"]');
      if (priceEl) {
        const match = priceEl.textContent?.match(/([\d.]*,?\d+)\s*(RON|lei)/i);
        if (match) {
          // Locale-agnostic: whichever separator appears LAST is the decimal
          // point (LibHumanitas uses "101.58", others use RO "101,58" — a
          // fixed "dot=thousands" assumption silently produced 10158).
          price = parseFloat(
            match[1].lastIndexOf(',') > match[1].lastIndexOf('.')
              ? match[1].replace(/\./g, '').replace(',', '.')
              : match[1].replace(/,/g, ''),
          );
        }
      }

      const imgEl = item.querySelector('img[data-src], img');
      const imgSrc = imgEl?.getAttribute('data-src') ?? imgEl?.getAttribute('src');

      const cardText = (item.textContent ?? '').toLowerCase();
      const in_stock = !/indisponibil|nu este momentan|stoc epuizat|epuizat/.test(cardText);

      results.push({
        title,
        price,
        url,
        image_url: normalizeImageUrl(imgSrc, baseUrl),
        store_name: storeName,
        store_id: storeId,
        in_stock,
      });
    }

    return results;
  }, { storeName: store.name, storeId: store.id });
}

/**
 * Magento stores (Noriel, Bookcity, Libhumanitas, Carrefour)
 * Products use .product-item containers with standard Magento markup.
 */
async function scrapeMagento(page, store) {
  try {
    await page.waitForSelector('.product-item', { timeout: 15000 });
  } catch {
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
  }

  return page.evaluate(({ storeName, storeId }) => {
    function normalizeImageUrl(src, base) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('data:')) return null;
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) return base + src;
      if (src.startsWith('http')) return src;
      return base + '/' + src;
    }
    const baseUrl = window.location.origin;
    const cards = document.querySelectorAll('.product-item');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const titleEl = card.querySelector('h2.product-item-name, .product-item-name, a.product-item-link');
      const title = titleEl?.textContent?.trim();
      if (!title) continue;

      const linkEl = card.querySelector('a[href]');
      const url = linkEl?.href;
      if (!url || seen.has(url)) continue;
      seen.add(url);

      let price = null;
      const priceEl = card.querySelector('[data-price-type="finalPrice"] .price, .special-price .price, .price');
      if (priceEl) {
        const match = priceEl.textContent?.trim()?.match(/([\d.,]+)\s*(lei|LEI|RON)/i);
        if (match) {
          // Locale-agnostic: whichever separator appears LAST is the decimal
          // point (LibHumanitas uses "101.58", others use RO "101,58" — a
          // fixed "dot=thousands" assumption silently produced 10158).
          price = parseFloat(
            match[1].lastIndexOf(',') > match[1].lastIndexOf('.')
              ? match[1].replace(/\./g, '').replace(',', '.')
              : match[1].replace(/,/g, ''),
          );
        }
      }

      const imgEl = card.querySelector('img.product-image-photo, img');
      const imgSrc = imgEl?.src;

      const stockEl = card.querySelector('.stock, [class*="unavailable"]');
      const stockText = stockEl?.textContent?.trim() ?? '';
      const in_stock = !stockText.toLowerCase().includes('epuizat') && !stockText.toLowerCase().includes('indisponibil');

      results.push({
        title,
        price,
        url,
        image_url: normalizeImageUrl(imgSrc, baseUrl),
        store_name: storeName,
        store_id: storeId,
        in_stock,
      });
    }

    return results;
  }, { storeName: store.name, storeId: store.id });
}

/**
 * OpenCart platform (e.g. ATU-Toys.ro) — classic server-rendered catalog.
 * Products use .product-thumb cards inside a .product-layout wrapper. The
 * listing page itself carries no stock-status marker — the "Add to Cart"
 * button renders unconditionally regardless of actual stock (confirmed live:
 * present even though OpenCart's own product PAGE shows a real
 * "Availability: In Stock/Out Of Stock" line). So each listed product's own
 * page is fetched (plain fetch, not a full Playwright page load) to read that
 * real status — cheap for the small catalogs this scraper covers so far.
 */
async function scrapeOpenCart(page, store) {
  try {
    await page.waitForSelector('.product-thumb', { timeout: 15000 });
  } catch {
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
  }

  const products = await page.evaluate(({ storeName, storeId }) => {
    function normalizeImageUrl(src, base) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('data:')) return null;
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) return base + src;
      if (src.startsWith('http')) return src;
      return base + '/' + src;
    }
    const baseUrl = window.location.origin;
    const cards = document.querySelectorAll('.product-thumb');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const linkEl = card.querySelector('h4 a[href], .caption a[href]');
      const title = linkEl?.textContent?.trim();
      const url = linkEl?.href;
      if (!title || !url || seen.has(url)) continue;
      seen.add(url);

      let price = null;
      const priceEl = card.querySelector('.price');
      if (priceEl) {
        const match = priceEl.textContent?.trim()?.match(/([\d.,]+)\s*(lei|LEI|RON)/i);
        if (match) {
          price = parseFloat(
            match[1].lastIndexOf(',') > match[1].lastIndexOf('.')
              ? match[1].replace(/\./g, '').replace(',', '.')
              : match[1].replace(/,/g, ''),
          );
        }
      }

      const imgEl = card.querySelector('.image img');
      const imgSrc = imgEl?.src;

      results.push({
        title,
        price,
        url,
        image_url: normalizeImageUrl(imgSrc, baseUrl),
        store_name: storeName,
        store_id: storeId,
        in_stock: true,
      });
    }

    return results;
  }, { storeName: store.name, storeId: store.id });

  await Promise.all(
    products.map(async (p) => {
      try {
        const res = await fetch(p.url, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(15000) });
        if (!res.ok) return; // leave the optimistic default on a fetch failure
        const html = await res.text();
        const match = html.match(/Availability:\s*([^<]+)/i);
        if (match) {
          const text = match[1].trim().toLowerCase();
          p.in_stock = !/out of stock|epuizat|indisponibil/.test(text);
        }
      } catch {
        // leave the optimistic default on a network error for this one product
      }
    }),
  );

  return products;
}

/**
 * Krit.ro — custom Next.js/React platform
 * Products use .product cards inside .product-grid-wrapper.
 */
async function scrapeKrit(page, store) {
  try {
    await page.waitForSelector('.product-grid-wrapper .product', { timeout: 15000 });
  } catch {
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
  }

  return page.evaluate(({ storeName, storeId }) => {
    function normalizeImageUrl(src, base) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('data:')) return null;
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) return base + src;
      if (src.startsWith('http')) return src;
      return base + '/' + src;
    }
    const baseUrl = window.location.origin;
    const cards = document.querySelectorAll('.product-grid-wrapper .product');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const link = card.querySelector('a.product-element');
      if (!link) continue;

      const url = link.href?.startsWith('/') ? baseUrl + link.href : link.href;
      if (seen.has(url)) continue;
      seen.add(url);

      const title = card.querySelector('.product-title')?.textContent?.trim();
      if (!title) continue;

      let price = null;
      const intPart = card.querySelector('.integer-price')?.textContent?.trim();
      const fracPart = card.querySelector('.fractional-price')?.textContent?.trim();
      if (intPart) {
        price = parseFloat(intPart + '.' + (fracPart || '0').replace('.', ''));
      }

      const imgEl = card.querySelector('img');
      const imgSrc = imgEl?.src;

      const cardText = card.textContent ?? '';
      const in_stock = !cardText.includes('Indisponibil') && !cardText.includes('Stoc epuizat');

      results.push({
        title,
        price,
        url,
        image_url: normalizeImageUrl(imgSrc, baseUrl),
        store_name: storeName,
        store_id: storeId,
        in_stock,
      });
    }

    return results;
  }, { storeName: store.name, storeId: store.id });
}

/**
 * Smyk — custom React platform. The site migrated smyk.ro -> www.smyk.com (the old
 * URL 301-redirects; markup is unchanged). Each product is a `.complex-product`
 * container that holds TWO `a.complex-product__link-wrapper` anchors (image + info),
 * so we iterate the container — not the anchors — to read name, price and image
 * (which live in different anchors) as one unit.
 *
 * Returns { products, confirmedEmpty }: `confirmedEmpty` is true when smyk.com
 * positively reports a legitimately empty search (its dedicated /search-empty
 * route, title "Niciun rezultat"), so classifyOutcome can treat it as 'success'
 * instead of a rawCount===0 'block'. A genuine failure (block/challenge/timeout,
 * layout change) leaves confirmedEmpty false so it still classifies as a block.
 */
async function scrapeSmyk(page, store) {
  // Positively detect smyk.com's own "no results" state up front. Two live markers:
  // the SSR body carries "Niciun rezultat" at the /search URL, and the client JS
  // then redirects to a dedicated /search-empty route — accept EITHER. Require the
  // product grid to be absent too, so a results page that happens to contain the
  // phrase can never be misread as empty. A confirmed-empty search is a normal
  // outcome (classifyOutcome → 'success'), not a failure that counts toward disable.
  const confirmedEmpty = await page.evaluate(() => {
    const noGrid = document.querySelectorAll('.complex-product').length === 0;
    const emptyRoute = /\/search-empty(\/|$)/.test(location.pathname);
    // textContent (not innerText) + title: the "Niciun rezultat" marker sits in a
    // node that's only made visible / promoted to the page title once the client JS
    // runs, but it is present in the SSR DOM immediately either way.
    const haystack = `${document.title ?? ''} ${document.body?.textContent ?? ''}`;
    const emptyMsg = /niciun rezultat|nu am g[ăa]sit|no results found/i.test(haystack);
    return noGrid && (emptyRoute || emptyMsg);
  }).catch(() => false);
  if (confirmedEmpty) {
    console.log(`  ${store.name}: confirmed empty search (no results) — healthy, not a failure`);
    return { products: [], confirmedEmpty: true };
  }

  try {
    await page.waitForSelector('.complex-product', { timeout: 15000 });
  } catch {
    // No grid and no confirmed-empty marker → a genuine failure (block/challenge/
    // layout change/timeout). Leave confirmedEmpty false so it classifies as a block.
    console.log(`  ${store.name}: No products found or page timed out`);
    return { products: [], confirmedEmpty: false };
  }

  const products = await page.evaluate(({ storeName, storeId }) => {
    function normalizeImageUrl(src, base) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('data:')) return null;
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) return base + src;
      if (src.startsWith('http')) return src;
      return base + '/' + src;
    }
    const baseUrl = window.location.origin;
    const cards = document.querySelectorAll('.complex-product');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const title = card.querySelector('.complex-product__name')?.textContent?.trim();
      if (!title) continue;

      // Prefer the product-page anchor (/…/p/…) — some cards lead with a shared
      // promo/category link that would collide across products under dedup. A
      // comma selector returns first-in-DOM-order, not by priority, so query in
      // explicit fallback order.
      const linkEl = card.querySelector('a[href*="/p/"]')
        || card.querySelector('a.complex-product__link-wrapper[href]')
        || card.querySelector('a[href]');
      const url = linkEl?.href;
      if (!url || seen.has(url)) continue;
      seen.add(url);

      let price = null;
      const priceEl = card.querySelector('.price--new, .complex-product__price');
      if (priceEl) {
        const match = priceEl.textContent?.trim()?.match(/([\d.,]+)\s*(lei|LEI|RON)/i);
        if (match) {
          // Locale-agnostic: whichever separator appears LAST is the decimal
          // point (LibHumanitas uses "101.58", others use RO "101,58" — a
          // fixed "dot=thousands" assumption silently produced 10158).
          price = parseFloat(
            match[1].lastIndexOf(',') > match[1].lastIndexOf('.')
              ? match[1].replace(/\./g, '').replace(',', '.')
              : match[1].replace(/,/g, ''),
          );
        }
      }

      const imgEl = card.querySelector('img[data-testid="image"], img');
      // Product images are lazy-loaded: the real URL sits in data-src while `src`
      // holds a shared "/images/product-cover.jpeg" placeholder until the lazyload
      // script fires. A headless scrape never scrolls, so prefer data-src.
      const imgSrc = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('src');

      // Smyk search results include both available and unavailable products;
      // check for unavailability indicators in the card
      const cardText = card.textContent ?? '';
      const unavailable = !!card.querySelector('[class*="unavailable"], button[disabled]')
        || /indisponibil|stoc epuizat|sold\s*out/i.test(cardText);

      results.push({
        title,
        price,
        url,
        image_url: normalizeImageUrl(imgSrc, baseUrl),
        store_name: storeName,
        store_id: storeId,
        in_stock: !unavailable,
      });
    }

    return results;
  }, { storeName: store.name, storeId: store.id });

  return { products, confirmedEmpty: false };
}

/**
 * Ozone.ro — search is a client-side FastSimon / InstantSearch+ widget.
 *
 * The `/instantsearchplus/result/` page returns ~938KB of HTML with ZERO product
 * markup — every `.product-card` is injected by JS after an async call to
 * api.fastsimon.com. The old DOM scrape (`waitForSelector('.product-card')`)
 * raced that render and intermittently extracted 0 products, tripping the
 * auto-disable. We now hit the same JSON API the page uses directly — no page
 * load, no render race — exactly like scrapeShopify's /products.json fetch. Like
 * scrapeShopify this takes no Playwright page and reports the fetch's OWN status +
 * challenge signal so block-detection still works: an HTTP status the server
 * actually returned (403/429) is exactly what classifyOutcome needs to flag a
 * block, so it is returned — NOT thrown. Only a network-level failure (the fetch
 * itself throwing — DNS/connection refused/AbortSignal timeout) propagates, which
 * the caller classifies as a transient failure.
 */
async function scrapeOzone(_page, store) {
  let q = '';
  try {
    q = new URL(store.url).searchParams.get('q') ?? '';
  } catch {
    // store.url not a valid URL — fall through with an empty query.
  }

  const apiUrl = buildFastSimonSearchUrl({
    uuid: OZONE_FASTSIMON.uuid,
    storeId: OZONE_FASTSIMON.storeId,
    q,
    perPage: 50,
  });

  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  const status = res.status;
  const text = await res.text();
  const challenged = detectChallengeText(text);

  if (!res.ok) {
    // A status the server actually sent (e.g. 403/429) is the block signal, not a
    // "hiccup" — return it so classifyOutcome({status}) → 'block' and the existing
    // auto-disable path fires. (Matches scrapeShopify.)
    console.log(`  ${store.name}: FastSimon API HTTP ${status}`);
    return { products: [], status, challenged };
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // 200 but not JSON → an interstitial/challenge in front of the API.
    console.log(`  ${store.name}: FastSimon API returned non-JSON (likely a block/interstitial)`);
    return { products: [], status, challenged: true };
  }

  const products = parseFastSimonResponse(json, { storeName: store.name, storeId: store.id });
  return { products, status, challenged };
}

/** Hard ceiling on category pages fetched, so a pagination-detection bug or a
 *  runaway category can never cause unbounded scraping. */
const WOOCOMMERCE_MAX_PAGES = 30;
/** Pacing between page navigations (matches the ~400-500ms delays elsewhere). */
const WOOCOMMERCE_PAGE_DELAY_MS = 500;

/**
 * DexHit.ro — WooCommerce platform (generic; any `woocommerce` store can reuse it).
 * Products use article/li.product elements with an `.outofstock` class for stock.
 *
 * Follows WooCommerce pagination: DexHit's category has no "in stock only" filter,
 * so in-stock items are scattered across pages — page 1 alone misses most of the
 * catalog. We walk every page via the pagination's real "next" href (never a
 * templated /page/N/ URL — WooCommerce truncates the middle pages behind a "…"
 * dots span, so they aren't directly linked from page 1), deduping by product URL.
 */
async function scrapeWooCommerce(page, store) {
  // Extract one already-loaded category page (wait for the grid, lazy-load scroll,
  // then read cards). Returns null if this page has no product grid at all.
  async function extractCurrentPage() {
    try {
      await page.waitForSelector('li.product, ul.products li.product', { timeout: 15000 });
    } catch {
      return null;
    }

    // Products are lazy-loaded on scroll
    await page.evaluate(async () => {
      for (let i = 0; i < 4; i++) {
        window.scrollBy(0, 1500);
        await new Promise((r) => setTimeout(r, 400));
      }
    });

    return page.evaluate(({ storeName, storeId }) => {
      function normalizeImageUrl(src, base) {
        if (!src) return null;
        src = src.trim();
        if (src.startsWith('data:')) return null;
        if (src.startsWith('//')) return 'https:' + src;
        if (src.startsWith('/')) return base + src;
        if (src.startsWith('http')) return src;
        return base + '/' + src;
      }
      const baseUrl = window.location.origin;
      const cards = document.querySelectorAll('article, li.product, .type-product');
      const results = [];
      const seen = new Set();

      for (const card of cards) {
        const linkEl = card.querySelector('a[href*="/product/"]');
        if (!linkEl) continue;

        const url = linkEl.href;
        if (seen.has(url)) continue;
        seen.add(url);

        const titleEl = card.querySelector('.woocommerce-loop-product__title, h2, h3');
        const title = titleEl?.textContent?.trim();
        if (!title) continue;

        let price = null;
        const priceEl = card.querySelector('ins .woocommerce-Price-amount, .price .woocommerce-Price-amount, .price');
        if (priceEl) {
          const match = priceEl.textContent?.trim()?.match(/([\d.,]+)\s*(lei|LEI|RON)/i);
          if (match) {
            // Locale-agnostic: whichever separator appears LAST is the decimal
            // point (LibHumanitas uses "101.58", others use RO "101,58" — a
            // fixed "dot=thousands" assumption silently produced 10158).
            price = parseFloat(
              match[1].lastIndexOf(',') > match[1].lastIndexOf('.')
                ? match[1].replace(/\./g, '').replace(',', '.')
                : match[1].replace(/,/g, ''),
            );
          }
        }

        const imgEl = card.querySelector('img');
        const imgSrc = imgEl?.src;

        const outOfStock = card.classList.contains('outofstock')
          || card.querySelector('[class*="out-of-stock"]') !== null;

        results.push({
          title,
          price,
          url,
          image_url: normalizeImageUrl(imgSrc, baseUrl),
          store_name: storeName,
          store_id: storeId,
          in_stock: !outOfStock,
        });
      }

      return results;
    }, { storeName: store.name, storeId: store.id });
  }

  // Read pagination on the current page: the highest page number present (WooCommerce
  // always includes the true last page even when it truncates the middle with "…"),
  // and the actual "next page" href to follow.
  function readPagination() {
    return page.evaluate(() => {
      const nav = document.querySelector('nav.woocommerce-pagination, ul.page-numbers');
      if (!nav) return { maxPage: 1, nextHref: null };
      let maxPage = 1;
      for (const el of nav.querySelectorAll('a.page-numbers, span.page-numbers')) {
        const n = parseInt(el.textContent.trim(), 10);
        if (Number.isFinite(n) && n > maxPage) maxPage = n;
      }
      const nextEl = nav.querySelector('a.next.page-numbers, a.page-numbers.next');
      return { maxPage, nextHref: nextEl ? nextEl.href : null };
    });
  }

  // Page 1 is already loaded (fetchStoreData navigated to store.url).
  const firstPage = await extractCurrentPage();
  if (firstPage === null) {
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
  }

  const results = [];
  const seen = new Set();
  const merge = (products) => {
    for (const p of products) {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      results.push(p);
    }
  };
  merge(firstPage);

  let { maxPage, nextHref } = await readPagination();
  if (maxPage > WOOCOMMERCE_MAX_PAGES) {
    console.warn(`  ${store.name}: pagination reports ${maxPage} pages — capping at ${WOOCOMMERCE_MAX_PAGES}`);
  }

  let pagesVisited = 1;
  while (nextHref && pagesVisited < WOOCOMMERCE_MAX_PAGES) {
    await new Promise((r) => setTimeout(r, WOOCOMMERCE_PAGE_DELAY_MS));
    await page.goto(nextHref, { waitUntil: 'load', timeout: 30000 });
    let pageProducts = await extractCurrentPage();
    if (pageProducts === null) {
      // A link we followed FROM the previous page (proof this page exists)
      // failed to render — not "we reached the end". Silently treating this
      // the same as a real last page used to return a partial catalog; the
      // staleness sweep then marked the missing page's products out-of-stock,
      // and a later fully-successful run "restocked" them — a false restock
      // alert for the missing chunk (this is what caused Pokemania's repeated
      // 59-product restock emails; same bug pattern here). One retry, then
      // fail the whole store attempt (→ transient, no stock corruption).
      await new Promise((r) => setTimeout(r, WOOCOMMERCE_PAGE_DELAY_MS));
      await page.goto(nextHref, { waitUntil: 'load', timeout: 30000 });
      pageProducts = await extractCurrentPage();
    }
    pagesVisited++;
    if (pageProducts === null) {
      throw new Error(`page ${pagesVisited} failed to render after a retry — aborting instead of returning a partial catalog`);
    }
    merge(pageProducts);
    ({ nextHref } = await readPagination());
  }

  if (pagesVisited > 1) {
    console.log(`  ${store.name}: scraped ${pagesVisited} page(s), ${results.length} unique products`);
  }
  return results;
}

/** Decode the HTML entities WordPress/WooCommerce leaves in Store API JSON text
 *  fields (titles come out as e.g. "Blister &#8211; Gengar", not real text). */
function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * DexHit.ro via WooCommerce's own Store API (/wp-json/wc/store/v1/products) —
 * clean, paginated JSON with a real `is_in_stock` boolean, instead of the
 * Playwright DOM scrape in scrapeWooCommerce above.
 *
 * Added because DexHit's category PAGE started returning HTTP 202/418
 * specifically to GitHub Actions' IP range (confirmed: the identical request
 * from a different network gets a normal 200) — a datacenter-IP/ASN block
 * that no amount of selector or pagination work fixes, since the block
 * happens before the page ever renders. This hits a different endpoint with
 * no browser/page load at all; it MIGHT not be caught by the same rule. If it
 * still is, classifyOutcome sees the real HTTP status and blocks/disables
 * exactly as before — this is a genuine attempt, not a guaranteed fix.
 */
async function scrapeDexHitApi(_page, store) {
  const origin = new URL(store.url).origin;
  const categorySlug = new URL(store.url).pathname.split('/').filter(Boolean).pop();

  const products = [];
  let pageNum = 1;
  let totalPages = 1;
  let status = 0;
  let challenged = false;

  do {
    const apiUrl = `${origin}/wp-json/wc/store/v1/products?category=${encodeURIComponent(categorySlug)}&per_page=100&page=${pageNum}`;
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    status = res.status;
    const text = await res.text();
    challenged = challenged || detectChallengeText(text);

    if (!res.ok) {
      console.log(`  ${store.name}: Store API HTTP ${status} (page ${pageNum})`);
      return { products: [], status, challenged };
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // 200 but not JSON → an interstitial/challenge sitting in front of the API.
      console.log(`  ${store.name}: Store API returned non-JSON (likely a block/interstitial)`);
      return { products: [], status, challenged: true };
    }

    for (const p of data) {
      const minorUnit = Number(p.prices?.currency_minor_unit ?? 2);
      const rawPrice = p.prices?.price != null ? Number(p.prices.price) : null;
      const price = rawPrice != null ? rawPrice / 10 ** minorUnit : null;

      products.push({
        title: decodeHtmlEntities(p.name),
        price,
        url: p.permalink,
        image_url: p.images?.[0]?.src ?? null,
        store_name: store.name,
        store_id: store.id,
        in_stock: p.is_in_stock === true,
      });
    }

    if (pageNum === 1) {
      totalPages = Number(res.headers.get('x-wp-totalpages') ?? 1);
    }
    pageNum++;
  } while (pageNum <= totalPages);

  return { products, status, challenged };
}

/**
 * Flamey.ro (shop.flamey.ro) — a bespoke storefront with a clean, fully public
 * JSON API (no auth/session/CSRF needed, unlike Carturesti's json-search). Two
 * calls: resolve the category slug from the store URL to its id, then page
 * through /api/shop/products for that category.
 *
 * The category filter is authoritative (an exact id, not a fuzzy text search
 * like Ozone's), so some genuinely-Pokémon items don't repeat "Pokémon" in
 * their own name (e.g. "Pitch Black - Sleeved Booster") — they'd otherwise be
 * wrongly dropped by the shared isGameProduct title check. Since every item
 * carries its own categoryName, prefix "Pokémon TCG: " onto titles that need
 * it rather than trusting free text alone.
 */
async function scrapeFlameyApi(_page, store) {
  const origin = new URL(store.url).origin;
  const slugPath = new URL(store.url).pathname.split('/').filter(Boolean).slice(-2).join('/');

  const resolveRes = await fetch(`${origin}/api/categories/resolve/${slugPath}`, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  const resolveStatus = resolveRes.status;
  const resolveText = await resolveRes.text();
  if (!resolveRes.ok) {
    console.log(`  ${store.name}: category resolve HTTP ${resolveStatus}`);
    return { products: [], status: resolveStatus, challenged: detectChallengeText(resolveText) };
  }

  let category;
  try {
    category = JSON.parse(resolveText);
  } catch {
    console.log(`  ${store.name}: category resolve returned non-JSON (likely a block/interstitial)`);
    return { products: [], status: resolveStatus, challenged: true };
  }

  const products = [];
  let pageNum = 1;
  let totalPages = 1;
  let status = resolveStatus;
  let challenged = false;

  do {
    const apiUrl = `${origin}/api/shop/products?page=${pageNum}&pageSize=100&category=${category.id}&isEvent=false`;
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    status = res.status;
    const text = await res.text();
    challenged = challenged || detectChallengeText(text);

    if (!res.ok) {
      console.log(`  ${store.name}: Shop API HTTP ${status} (page ${pageNum})`);
      return { products: [], status, challenged };
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.log(`  ${store.name}: Shop API returned non-JSON (likely a block/interstitial)`);
      return { products: [], status, challenged: true };
    }

    for (const p of data.items ?? []) {
      const needsPrefix = !/pok[eé]mon/i.test(p.name) && /pok[eé]mon/i.test(p.categoryName ?? '');
      const title = needsPrefix ? `Pokémon TCG: ${p.name}` : p.name;
      const imageUrl = p.imageUrl ? (p.imageUrl.startsWith('http') ? p.imageUrl : origin + p.imageUrl) : null;

      products.push({
        title,
        price: typeof p.price === 'number' ? p.price : null,
        url: `${origin}/product/${p.slug}`,
        image_url: imageUrl,
        store_name: store.name,
        store_id: store.id,
        in_stock: p.inStock === true,
        // Matched an exact category id (Flamey's own taxonomy), not a text
        // search — skip the generic TCG-keyword title heuristic, which would
        // wrongly drop things like "Premium Collection"/"Coin Set".
        categoryConfirmed: true,
      });
    }

    if (pageNum === 1) {
      totalPages = Number(data.totalPages ?? 1);
    }
    pageNum++;
  } while (pageNum <= totalPages);

  return { products, status, challenged };
}

/**
 * SecretCards.ro — Laravel + Inertia.js storefront. No separate JSON API: the
 * full page props (including the product list) are server-side rendered into
 * a `<script data-page="app" type="application/json">` blob in the initial
 * HTML — same "parse the embedded state" approach as scrapeCarturesti, just a
 * plain fetch instead of Playwright since Inertia SSRs the data, no client JS
 * needed to see it. The store.url's query string (?brand=pokemon&...) IS the
 * category filter, so it's fetched as-is (unlike Shopify's helper, which
 * strips query params before building its own).
 */
async function scrapeSecretCardsApi(_page, store) {
  const products = [];
  let pageNum = 1;
  let lastPage = 1;
  let status = 0;
  let challenged = false;

  const separator = store.url.includes('?') ? '&' : '?';

  do {
    const pageUrl = pageNum === 1 ? store.url : `${store.url}${separator}page=${pageNum}`;
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(30000),
    });
    status = res.status;
    const html = await res.text();
    challenged = challenged || detectChallengeText(html);

    if (!res.ok) {
      console.log(`  ${store.name}: HTTP ${status} (page ${pageNum})`);
      return { products: [], status, challenged };
    }

    const match = html.match(/<script data-page="app" type="application\/json">(.*?)<\/script>/s);
    if (!match) {
      console.log(`  ${store.name}: could not find embedded Inertia page data (likely a block/interstitial)`);
      return { products: [], status, challenged: true };
    }

    let data;
    try {
      data = JSON.parse(match[1]);
    } catch {
      console.log(`  ${store.name}: embedded Inertia page data was not valid JSON`);
      return { products: [], status, challenged: true };
    }

    const page = data.props?.products;
    for (const p of page?.data ?? []) {
      products.push({
        title: p.name,
        price: typeof p.current_price === 'number' ? p.current_price : null,
        url: `https://secretcards.ro/products/${p.slug}`,
        image_url: p.primary_image?.url ?? null,
        store_name: store.name,
        store_id: store.id,
        in_stock: p.is_in_stock === true,
        // ?brand=pokemon in the store URL is the store's own authoritative
        // filter — skip the generic TCG-keyword title heuristic (like Flamey),
        // which would wrongly drop items that don't repeat "Pokemon" in their
        // own name (e.g. a set/box name alone).
        categoryConfirmed: true,
      });
    }

    if (pageNum === 1) {
      lastPage = Number(page?.last_page ?? 1);
    }
    pageNum++;
  } while (pageNum <= lastPage);

  return { products, status, challenged };
}

/**
 * LumeaJocurilor.ro — custom platform
 * Products use .wareItems .item cards with data-id attributes.
 */
async function scrapeLumeaJocurilor(page, store) {
  try {
    await page.waitForSelector('.wareItems .item', { timeout: 15000 });
  } catch {
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
  }

  return page.evaluate(({ storeName, storeId }) => {
    function normalizeImageUrl(src, base) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('data:')) return null;
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) return base + src;
      if (src.startsWith('http')) return src;
      return base + '/' + src;
    }
    const baseUrl = window.location.origin;
    const cards = document.querySelectorAll('.wareItems .item');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const titleLink = card.querySelector('a.name');
      if (!titleLink) continue;

      const title = titleLink.textContent?.trim();
      const url = titleLink.href?.startsWith('/') ? baseUrl + titleLink.href : titleLink.href;
      if (!title || !url || seen.has(url)) continue;
      seen.add(url);

      let price = null;
      const priceEl = card.querySelector('.price');
      if (priceEl) {
        const match = priceEl.textContent?.trim()?.match(/([\d.,]+)\s*(lei|LEI|RON)/i);
        if (match) {
          // Locale-agnostic: whichever separator appears LAST is the decimal
          // point (LibHumanitas uses "101.58", others use RO "101,58" — a
          // fixed "dot=thousands" assumption silently produced 10158).
          price = parseFloat(
            match[1].lastIndexOf(',') > match[1].lastIndexOf('.')
              ? match[1].replace(/\./g, '').replace(',', '.')
              : match[1].replace(/,/g, ''),
          );
        }
      }

      const imgEl = card.querySelector('img.photo, img');
      const imgSrc = imgEl?.src;

      const stockEl = card.querySelector('.storeInfo');
      const stockText = stockEl?.textContent?.trim() ?? '';
      // Default to in-stock if no stock element found; only mark OOS when explicitly stated
      const in_stock = !stockText || !stockText.includes('Nu este');

      results.push({
        title,
        price,
        url,
        image_url: normalizeImageUrl(imgSrc, baseUrl),
        store_name: storeName,
        store_id: storeId,
        in_stock,
      });
    }

    return results;
  }, { storeName: store.name, storeId: store.id });
}

/**
 * Raijucarii.ro — rShop platform
 * Products use a.products__block__item__link as card elements.
 */
async function scrapeRaijucarii(page, store) {
  for (const label of ['Acceptă', 'Accept', 'Sunt de acord', 'De acord', 'OK']) {
    try {
      await page.getByRole('button', { name: label }).click({ timeout: 2000 });
      break;
    } catch { /* try next */ }
  }

  try {
    await page.waitForSelector('.c-product-thumb', { timeout: 15000 });
  } catch {
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
  }

  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) {
      window.scrollBy(0, 1500);
      await new Promise((r) => setTimeout(r, 400));
    }
  });

  return page.evaluate(({ storeName, storeId }) => {
    function normalizeImageUrl(src, base) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('data:')) return null;
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) return base + src;
      if (src.startsWith('http')) return src;
      return base + '/' + src;
    }
    const baseUrl = window.location.origin;
    const cards = document.querySelectorAll('.c-product-thumb');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const linkEl = card.querySelector('a.c-product-thumb__img[href], a[href]');
      if (!linkEl) continue;

      let url = linkEl.getAttribute('href');
      if (url && url.startsWith('/')) url = baseUrl + url;
      if (!url || seen.has(url)) continue;
      seen.add(url);

      // Title from the link's title attr / img alt; collapse a doubled prefix
      let title = (linkEl.getAttribute('title') || card.querySelector('img')?.getAttribute('alt') || '').trim();
      title = title.replace(/^(.+?:\s+)\1+/i, '$1');
      if (!title) continue;

      // Price: integer + ".is-small" decimals share a "*price*" container
      let price = null;
      const priceEl = card.querySelector('[class*="price"]') ?? card.querySelector('.is-small')?.parentElement;
      const priceText = (priceEl?.textContent ?? '').replace(/\s/g, '');
      const m = priceText.match(/(\d[\d.]*,\d{2}|\d[\d.]+)/);
      // Locale-agnostic: whichever separator appears LAST is the decimal point.
      if (m) {
        price = parseFloat(
          m[1].lastIndexOf(',') > m[1].lastIndexOf('.') ? m[1].replace(/\./g, '').replace(',', '.') : m[1].replace(/,/g, ''),
        );
      }

      const imgEl = card.querySelector('img');
      const imgSrc = imgEl?.getAttribute('data-src') ?? imgEl?.getAttribute('src');

      // ".sc-text" reads e.g. "În stoc > 5 buc" or "Momentan nu este disponibil".
      // Careful: "nu este disponibil" contains "disponibil", so check negatives.
      const stockText = (card.querySelector('.sc-text')?.textContent ?? card.textContent ?? '').toLowerCase();
      const oos = /momentan nu|nu este disponibil|indisponibil|epuizat|vypredan|sold ?out/.test(stockText);
      const in_stock = /(în stoc|in stoc|disponibil)/.test(stockText) && !oos;

      results.push({
        title,
        price,
        url,
        image_url: normalizeImageUrl(imgSrc, baseUrl),
        store_name: storeName,
        store_id: storeId,
        in_stock,
      });
    }

    return results;
  }, { storeName: store.name, storeId: store.id });
}

/**
 * Tulli.ro — Hungarian-built toy store (netjatek platform).
 * Search results are <a class="product-name"> links; the price lives in a
 * nearby ".price" within the same card. Results are lazy-loaded on scroll.
 */
async function scrapeTulli(page, store) {
  for (const label of ['Acceptă', 'Accept', 'Sunt de acord', 'De acord', 'OK']) {
    try {
      await page.getByRole('button', { name: label }).click({ timeout: 2000 });
      break;
    } catch { /* try next */ }
  }

  try {
    await page.waitForSelector('a.product-name', { timeout: 15000 });
  } catch {
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
  }

  // Results lazy-load on scroll
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) {
      window.scrollBy(0, 1500);
      await new Promise((r) => setTimeout(r, 400));
    }
  });

  return page.evaluate(({ storeName, storeId }) => {
    function normalizeImageUrl(src, base) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('data:')) return null;
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) return base + src;
      if (src.startsWith('http')) return src;
      return base + '/' + src;
    }
    const baseUrl = window.location.origin;
    const anchors = document.querySelectorAll('a.product-name');
    const results = [];
    const seen = new Set();

    for (const a of anchors) {
      const title = a.textContent?.trim();
      let url = a.getAttribute('href');
      if (!title || !url) continue;
      if (url.startsWith('/')) url = baseUrl + url;
      if (seen.has(url)) continue;
      seen.add(url);

      // Climb to the nearest ancestor that holds the price
      let card = a;
      for (let i = 0; i < 5 && card.parentElement; i++) {
        card = card.parentElement;
        if (card.querySelector('.price')) break;
      }

      const priceText = card.querySelector('.price')?.textContent ?? '';
      const m = priceText.replace(/\s/g, '').match(/([\d.,]+)/);
      let price = null;
      // Locale-agnostic: whichever separator appears LAST is the decimal point.
      if (m) {
        price = parseFloat(
          m[1].lastIndexOf(',') > m[1].lastIndexOf('.') ? m[1].replace(/\./g, '').replace(',', '.') : m[1].replace(/,/g, ''),
        );
      }

      const imgEl = card.querySelector('img');
      const imgSrc = imgEl?.getAttribute('data-src') ?? imgEl?.getAttribute('src');

      const cardText = (card.textContent ?? '').toLowerCase();
      const in_stock = !/indisponibil|stoc epuizat|nu este disponibil/.test(cardText);

      results.push({
        title,
        price,
        url,
        image_url: normalizeImageUrl(imgSrc, baseUrl),
        store_name: storeName,
        store_id: storeId,
        in_stock,
      });
    }

    return results;
  }, { storeName: store.name, storeId: store.id });
}

/**
 * BebeTei.ro — custom e-commerce platform
 * Products use .product-item.product-details containers.
 */
async function scrapeBebetei(page, store) {
  try {
    await page.waitForSelector('.product-item.product-details', { timeout: 15000 });
  } catch {
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
  }

  return page.evaluate(({ storeName, storeId }) => {
    function normalizeImageUrl(src, base) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('data:')) return null;
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) return base + src;
      if (src.startsWith('http')) return src;
      return base + '/' + src;
    }
    const baseUrl = window.location.origin;
    const cards = document.querySelectorAll('.product-item.product-details');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const imgLink = card.querySelector('.product-image-listing');
      if (!imgLink) continue;

      const url = imgLink.href;
      if (!url || seen.has(url)) continue;
      seen.add(url);

      // Use image alt for full title — .item-title text is CSS-truncated with ellipsis
      const imgEl = card.querySelector('.product-image-listing img, picture img');
      const title = imgEl?.alt?.trim() || card.querySelector('.item-title')?.textContent?.trim();
      if (!title) continue;

      let price = null;
      const priceEl = card.querySelector('.regular-price .price, .price-box');
      if (priceEl) {
        const match = priceEl.textContent?.trim()?.match(/([\d.,]+)\s*(lei|LEI|RON)/i);
        if (match) {
          // Locale-agnostic: whichever separator appears LAST is the decimal
          // point (LibHumanitas uses "101.58", others use RO "101,58" — a
          // fixed "dot=thousands" assumption silently produced 10158).
          price = parseFloat(
            match[1].lastIndexOf(',') > match[1].lastIndexOf('.')
              ? match[1].replace(/\./g, '').replace(',', '.')
              : match[1].replace(/,/g, ''),
          );
        }
      }

      const imgSrc = imgEl?.src;

      // btn-out-of-stock is present on all cards; btn-primary = available in stores,
      // btn-light = truly unavailable (Indisponibil)
      const outOfStockBtn = card.querySelector('.btn-out-of-stock');
      const in_stock = outOfStockBtn ? outOfStockBtn.classList.contains('btn-primary') : true;

      results.push({
        title,
        price,
        url,
        image_url: normalizeImageUrl(imgSrc, baseUrl),
        store_name: storeName,
        store_id: storeId,
        in_stock,
      });
    }

    return results;
  }, { storeName: store.name, storeId: store.id });
}

/**
 * Carturesti.ro — AngularJS SPA (.cartu-grid-tile cards).
 * The Pokemon search returns general books too, so we keep only titles
 * containing "Pokemon TCG:". In stock when the stock label reads
 * "În stoc" or "Doar în librărie".
 */
async function scrapeCarturesti(page, store) {
  try {
    await page.waitForSelector('.cartu-grid-tile prod-grid-box', { timeout: 20000 });
  } catch {
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
  }

  return page.evaluate(({ storeName, storeId }) => {
    function normalizeImageUrl(src, base) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('data:')) return null;
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) return base + src;
      if (src.startsWith('http')) return src;
      return base + '/' + src;
    }
    const IN_STOCK_LABELS = ['în stoc', 'doar în librărie'];
    const baseUrl = window.location.origin;
    const cards = document.querySelectorAll('.cartu-grid-tile');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const title = card.querySelector('h5.md-title')?.textContent?.trim();
      if (!title) continue;

      // The "tcg" search lists every brand's TCG products; keep only Pokemon
      // ones. Matches both "Pokemon TCG:" and "Pokemon TCG -" naming.
      if (!title.toLowerCase().includes('pokemon tcg')) continue;

      const linkEl = card.querySelector('a.select-item-event[href], a.clean-a[href]');
      let url = linkEl?.getAttribute('href') ?? null;
      if (url && url.startsWith('/')) url = baseUrl + url;
      if (!url || seen.has(url)) continue;
      seen.add(url);

      // Price: the .suma span carries a clean `content` attribute (e.g. "71.00")
      const sumaEl = card.querySelector('.productPrice .suma');
      let price = null;
      const priceContent = sumaEl?.getAttribute('content');
      if (priceContent) {
        price = parseFloat(priceContent);
      } else if (sumaEl) {
        const t = sumaEl.textContent.replace(/[^\d.,]/g, '').replace(',', '.');
        price = t ? parseFloat(t) : null;
      }

      const imgEl = card.querySelector('.productImageContainer img');
      const imgSrc = imgEl?.getAttribute('src') ?? imgEl?.getAttribute('data-ng-src');

      // Stock: read the visible label text inside .productStock
      const stockEl = card.querySelector('.productStock span[data-ng-bind-html]');
      const stockLabel = stockEl?.textContent?.trim().toLowerCase() ?? '';
      const in_stock = IN_STOCK_LABELS.includes(stockLabel);

      results.push({
        title,
        price,
        url,
        image_url: normalizeImageUrl(imgSrc, baseUrl),
        store_name: storeName,
        store_id: storeId,
        in_stock,
      });
    }

    return results;
  }, { storeName: store.name, storeId: store.id });
}

/**
 * Foon.ro — Slovak-built e-shop (.k-i product cards inside #data).
 * Products render ONLY after the cookie consent is accepted, so we click it
 * first. Price is .k-i-c (current/discounted), stock text is in .k-i-c-d.
 */
async function scrapeFoon(page, store) {
  // Accept cookie consent — the product grid does not render until it's gone.
  for (const label of ['Acceptă', 'Acceptă tot', 'Accept', 'Sunt de acord']) {
    try {
      await page.getByRole('button', { name: label }).click({ timeout: 2500 });
      break;
    } catch { /* try next label */ }
  }

  try {
    await page.waitForSelector('#data .k-i', { timeout: 15000 });
  } catch {
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
  }

  // Nudge lazy-loaded images/content
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) {
      window.scrollBy(0, 1500);
      await new Promise((r) => setTimeout(r, 500));
    }
  });

  return page.evaluate(({ storeName, storeId }) => {
    function normalizeImageUrl(src, base) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('data:')) return null;
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) return base + src;
      if (src.startsWith('http')) return src;
      return base + '/' + src;
    }
    const baseUrl = window.location.origin;
    const cards = document.querySelectorAll('#data .k-i');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const linkEl = card.querySelector('.k-i-t a[href]') ?? card.querySelector('a.thumbnail[href]');
      const title = card.querySelector('.k-i-t a')?.textContent?.trim();
      if (!title || !linkEl) continue;

      let url = linkEl.getAttribute('href');
      if (url && url.startsWith('/')) url = baseUrl + url;
      if (!url || seen.has(url)) continue;
      seen.add(url);

      // .k-i-c is the current (possibly discounted) price; .k-i-c-s is the old one
      const priceText = (card.querySelector('.k-i-c') ?? card.querySelector('.k-i-c-s'))?.textContent ?? '';
      const m = priceText.replace(/\s/g, '').match(/([\d.,]+)/);
      let price = null;
      // Locale-agnostic: whichever separator appears LAST is the decimal point.
      if (m) {
        price = parseFloat(
          m[1].lastIndexOf(',') > m[1].lastIndexOf('.') ? m[1].replace(/\./g, '').replace(',', '.') : m[1].replace(/,/g, ''),
        );
      }

      const imgEl = card.querySelector('img');
      const imgSrc = imgEl?.getAttribute('src') ?? imgEl?.getAttribute('data-src');

      const stockText = (card.querySelector('.k-i-c-d')?.textContent ?? '').toLowerCase();
      const in_stock =
        /(în stoc|in stoc|disponibil)/.test(stockText) &&
        !/(indisponibil|epuizat|la comand)/.test(stockText);

      results.push({
        title,
        price,
        url,
        image_url: normalizeImageUrl(imgSrc, baseUrl),
        store_name: storeName,
        store_id: storeId,
        in_stock,
      });
    }
    return results;
  }, { storeName: store.name, storeId: store.id });
}

/**
 * Normalize a product URL to a canonical form for consistent upsert matching.
 * Strips query parameters, fragments, trailing slashes, and lowercases.
 */
function normalizeProductUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    return (parsed.origin + parsed.pathname).replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.split('?')[0].split('#')[0].replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * Each store row is tagged with one `game` (see migration 023) and only ever
 * searches/lists that game, but broad-marketplace searches (Ozone's FastSimon
 * search, a Shopify store's full catalog, etc.) still return other card games
 * or unrelated merch mixed in. GAME_NAME_PATTERNS narrows a store's raw results
 * down to titles that actually name its assigned game.
 */
const GAME_NAME_PATTERNS = {
  pokemon: /pok[eé]mon/i,
  magic: /magic(?:\s*:?\s*the\s*gathering)?|\bmtg\b/i,
  lorcana: /lorcana/i,
  yugioh: /yu-?gi-?oh/i,
  digimon: /digimon/i,
  one_piece: /one piece/i,
  duel_masters: /duel masters/i,
  dragon_ball_super: /dragon ball(?:\s*super)?/i,
  weiss_schwarz: /wei[sß]{1,2} schwarz/i,
};

/** Returns true if the product title looks like a TCG product for the given game. */
function isGameProduct(game, title) {
  if (!title) return false;
  if (/binder|sleeve|alcove/i.test(title)) return false;
  const namePattern = GAME_NAME_PATTERNS[game] ?? GAME_NAME_PATTERNS.pokemon;
  if (!namePattern.test(title)) return false;
  // "jcc" = Joc de Cărți Colecționabile, the RO/FR abbreviation some stores
  // (Tulli) use in place of "TCG" — same thing, different label. "card game"
  // (singular "card") covers One Piece listings like "One Piece Card Game:
  // Premium Card Collection", which name neither "TCG" nor plural "cards".
  return /tcg|jcc|carti|cards|card game|booster|blister|trainer/i.test(title);
}

/**
 * Persist a store's consecutive block-like failure streak and FLAG it (stays
 * enabled, but polled hourly — see FLAGGED_CHECK_INTERVAL_MINUTES) once the
 * streak hits the flag threshold. Only AUTO-DISABLES once a store has stayed
 * continuously flagged for FLAG_DISABLE_GRACE_MS (12h) — a short burst of
 * failures is often transient, so disabling outright was too aggressive; 12h
 * of sustained failure is a much stronger signal that it needs manual
 * investigation. Never auto-re-enables — that stays a manual decision after
 * investigating. A transient (one-off) error leaves the streak untouched; a
 * success resets it to 0 and clears any flag. Also stamps `last_scraped_at` for
 * EVERY attempt (regardless of outcome) — that drives the due-based scheduling.
 */
async function updateStoreFailureState(supabase, store, outcome) {
  const prevState = {
    consecutiveFailures: store.consecutive_failures ?? 0,
    isFlagged: store.is_flagged === true,
    flaggedAt: store.flagged_at ?? null,
  };
  const { consecutiveFailures, isFlagged, flaggedAt, disable } = applyFailureOutcome(prevState, outcome);

  // Always record the attempt time so due-based scheduling advances even on a
  // failure/block; also carry the (possibly unchanged) failure streak/flag.
  const update = {
    consecutive_failures: consecutiveFailures,
    is_flagged: isFlagged,
    flagged_at: flaggedAt,
    last_scraped_at: new Date().toISOString(),
  };
  if (disable) update.is_enabled = false;
  const { error } = await supabase.from('stores').update(update).eq('id', store.id);
  if (error) {
    console.error(`  ${store.name}: could not update failure/schedule state — ${error.message}`);
    return;
  }
  if (disable) {
    console.error(
      `  🚫 ${store.name}: AUTO-DISABLED after staying flagged for 12h+ (${consecutiveFailures} consecutive block-like failures) — likely being blocked. Investigate, then re-enable manually.`,
    );
    await notifyStoreDisabled(store, consecutiveFailures);
  } else if (isFlagged && !prevState.isFlagged) {
    console.warn(
      `  ⚑ ${store.name}: FLAGGED after ${consecutiveFailures} consecutive block-like failures — now checking hourly. Will auto-disable if still failing after 12h.`,
    );
  }
}

/** Best-effort email alert when a store is auto-disabled (log line is emitted regardless). */
async function notifyStoreDisabled(store, count) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  // Admin-only OPERATIONAL alert — goes only to the operator's own address(es)
  // (ALERT_EMAIL_TO), NEVER to `getRecipients()`/the subscribers table (that's
  // the product-restock audience). If ALERT_EMAIL_TO is unset, skip the email —
  // the console log line above is the fallback notification.
  const recipients = (process.env.ALERT_EMAIL_TO ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!gmailUser || !gmailPass || recipients.length === 0) return;
  try {
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: gmailUser, pass: gmailPass } });
    await transporter.sendMail({
      from: `TCG Tracker <${gmailUser}>`,
      to: recipients.join(', '),
      subject: `⚠️ Scraper auto-disabled: ${store.name}`,
      html:
        `<p>The scraper for <strong>${escapeHtml(store.name)}</strong> ` +
        `(<a href="${sanitizeUrl(store.url)}">${escapeHtml(store.url)}</a>) was <strong>auto-disabled</strong> ` +
        `after ${count} consecutive block-like failures (HTTP 403/429, a CAPTCHA/challenge page, or no product ` +
        `structure found).</p><p>This usually means the store is blocking the scraper. Investigate, then ` +
        `re-enable it manually in the dashboard once resolved.</p>`,
    });
    console.log(`  ${store.name}: disable notification emailed to admin (${recipients.length} address(es))`);
  } catch (e) {
    console.error(`  ${store.name}: disable notification email failed — ${e.message}`);
  }
}

/**
 * Main scraper — fetches stores from DB, iterates, collects products.
 */
/**
 * Fetch a store's raw products + block signals. Shopify stores SKIP the wasted
 * Playwright page load entirely (scrapeShopify does its own JSON fetch and never
 * touches the page) and report their own HTTP status/challenge signal so
 * block-detection still gets real inputs.
 * @returns {Promise<{ raw: object[], status: number, challenged: boolean, confirmedEmpty: boolean }>}
 *   confirmedEmpty — the scraper positively confirmed the site's own "no results"
 *   state (opt-in; a legit empty search, not a failure). Default false.
 */
async function fetchStoreData(store, browser) {
  if (store.scraper_type === 'shopify') {
    const r = await scrapeShopify(null, store); // { products, status, challenged } — no page load
    return { raw: r.products ?? [], status: r.status ?? 0, challenged: r.challenged === true, confirmedEmpty: r.confirmedEmpty === true };
  }

  if (store.scraper_type === 'ozone') {
    const r = await scrapeOzone(null, store); // FastSimon JSON API — no page load
    return { raw: r.products ?? [], status: r.status ?? 0, challenged: r.challenged === true, confirmedEmpty: r.confirmedEmpty === true };
  }

  if (store.scraper_type === 'woocommerce_api') {
    const r = await scrapeDexHitApi(null, store); // WooCommerce Store API — no page load
    return { raw: r.products ?? [], status: r.status ?? 0, challenged: r.challenged === true, confirmedEmpty: false };
  }

  if (store.scraper_type === 'flamey_api') {
    const r = await scrapeFlameyApi(null, store); // Flamey's own JSON API — no page load
    return { raw: r.products ?? [], status: r.status ?? 0, challenged: r.challenged === true, confirmedEmpty: false };
  }

  if (store.scraper_type === 'secretcards_api') {
    const r = await scrapeSecretCardsApi(null, store); // embedded Inertia page data — no page load
    return { raw: r.products ?? [], status: r.status ?? 0, challenged: r.challenged === true, confirmedEmpty: false };
  }

  const scrapeFn = SCRAPER_MAP[store.scraper_type];
  const context = await browser.newContext({
    userAgent: BROWSER_UA,
    viewport: { width: 1280, height: 800 },
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(store.url, { waitUntil: 'load', timeout: 30000 });
    const status = response?.status() ?? 0;

    // Block signals observable without DOM-injection: HTTP status + challenge markers.
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 4000) ?? '').catch(() => '');
    const challenged =
      detectChallengeText(bodyText) ||
      (await page
        .$('iframe[src*="challenges.cloudflare"], .cf-turnstile, .g-recaptcha, .h-captcha, #challenge-form')
        .then((el) => el != null)
        .catch(() => false));

    // Scrapers return either a plain products array or, if they opt into the
    // confirmed-empty signal (e.g. scrapeSmyk), { products, confirmedEmpty }.
    const result = await scrapeFn(page, store);
    const raw = Array.isArray(result) ? result : (result?.products ?? []);
    const confirmedEmpty = Array.isArray(result) ? false : result?.confirmedEmpty === true;
    return { raw, status, challenged, confirmedEmpty };
  } finally {
    await context.close();
  }
}

async function scrapeAll() {
  // Startup jitter (0–20s): runs triggered close together (GitHub's native cron +
  // an external cron-job.org dispatch) then don't check due stores in lockstep.
  const jitterMs = Math.floor(Math.random() * 20_000);
  if (jitterMs > 0) {
    console.log(`Startup jitter: ${(jitterMs / 1000).toFixed(1)}s`);
    await new Promise((resolve) => setTimeout(resolve, jitterMs));
  }

  const supabase = initSupabase();
  const stores = await fetchStores(supabase);

  if (stores.length === 0) {
    console.log('No stores due to scrape');
    return { products: [], scrapedStoreIds: [] };
  }

  // Only spin up Playwright if a store that actually needs a browser is due.
  // shopify + ozone are JSON-API scrapers (no page load), so a due-set of only
  // those skips launching Chromium entirely.
  const BROWSERLESS_TYPES = new Set(['shopify', 'ozone', 'woocommerce_api', 'flamey_api', 'secretcards_api']);
  const needsBrowser = stores.some((s) => !BROWSERLESS_TYPES.has(s.scraper_type));
  const browser = needsBrowser ? await chromium.launch({ headless: true }) : null;
  const allProducts = [];
  const scrapedStoreIds = [];

  const commit = (store, raw, status, challenged, confirmedEmpty = false) => {
    // categoryConfirmed (opt-in, like confirmedEmpty): the scraper matched an
    // exact category id, not a loose text search — e.g. Flamey's "Premium
    // Collection"/"Coin Set"/"V-Union Collection Box" all say "Pokemon" but
    // don't contain any TCG-ish keyword, so the title heuristic below would
    // wrongly drop them despite Flamey's own taxonomy confirming they're
    // Pokémon TCG products (their unrelated merch lives in separate
    // categories like Funko POP). Trust the source over the heuristic.
    const game = store.game ?? 'pokemon';
    const products = raw
      .filter((p) => p.categoryConfirmed === true || isGameProduct(game, p.title))
      .map((p) => ({ ...p, game }));
    const outcome = classifyOutcome({ status, challenged, rawCount: raw.length, confirmedEmpty });
    if (outcome === 'success') {
      allProducts.push(...products);
      scrapedStoreIds.push(store.id);
      const emptyNote = confirmedEmpty && raw.length === 0 ? ' — confirmed empty search (healthy, no matches)' : '';
      console.log(`  ${store.name}: ${products.length} TCG products found (${raw.length - products.length} non-TCG filtered)${emptyNote}`);
    } else {
      console.warn(`  ${store.name}: block-like failure (HTTP ${status}${challenged ? ', challenge page' : ''}, ${raw.length} products)`);
    }
    return outcome;
  };

  for (const [i, store] of stores.entries()) {
    // Pace requests across stores (2-5s jitter, skipped before the first): several
    // unrelated stores auto-disabled within the same short window on 2026-07-04
    // (different platforms, different HTTP statuses — 403/418/202/empty-200), which
    // isn't consistent with each site independently breaking. A shared WAF/CDN bot
    // score reacting to a burst of automated page loads from the same runner IP in
    // a few seconds is the more likely trigger, so spread the requests out.
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 2000 + Math.floor(Math.random() * 3000)));
    }

    if (!SCRAPER_MAP[store.scraper_type]) {
      console.error(`  ${store.name}: Unknown scraper type "${store.scraper_type}"`);
      await updateStoreFailureState(supabase, store, 'transient'); // still mark attempted (advances scheduling)
      continue;
    }

    let outcome = 'transient';
    try {
      console.log(`Scraping ${store.name}...`);
      const { raw, status, challenged, confirmedEmpty } = await fetchStoreData(store, browser);
      outcome = commit(store, raw, status, challenged, confirmedEmpty);
    } catch (err) {
      outcome = 'transient'; // one-off nav/network error — does NOT count toward auto-disable
      console.error(`  ${store.name}: ERROR — ${err.message}`);
    }

    await updateStoreFailureState(supabase, store, outcome);
  }

  await browser?.close();

  console.log(`\nTotal: ${allProducts.length} products scraped`);
  return { products: allProducts, scrapedStoreIds };
}

/**
 * Fetch every row of a query, paginating past PostgREST's default 1000-row cap.
 * A plain `.select()` silently TRUNCATES at 1000 rows with no error — once the
 * products table passed 1000 rows, the "does this URL already exist" check in
 * syncToSupabase started missing whichever ~N products fell outside that
 * window (there's no ORDER BY, so it's not even a stable set), making them
 * look brand new on every single scrape and re-firing "new product" alerts
 * for products that had already been sitting there, unchanged, for days.
 */
async function fetchAllRows(queryFactory) {
  const PAGE_SIZE = 1000;
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFactory().range(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return { data: rows, error: null };
}

/**
 * Sync scraped products to Supabase using upsert on URL.
 * Updates price, image_url, in_stock for existing products.
 * Returns { inserted, updated, insertedProducts } for alert use.
 */
async function syncToSupabase(products, scrapedStoreIds = []) {
  const supabase = initSupabase();

  // Fetch existing URLs + prior stock state to distinguish new/updated and
  // to detect out-of-stock -> in-stock restock transitions.
  const { data: existing, error: fetchError } = await fetchAllRows(() =>
    supabase.from('products').select('url, in_stock'),
  );

  if (fetchError) {
    throw new Error(`Failed to fetch existing products: ${fetchError.message}`);
  }

  const existingUrls = new Set(existing.map((row) => row.url));
  const prevStock = new Map(existing.map((row) => [row.url, row.in_stock]));
  const insertedProducts = [];
  // Products to alert on: newly-listed AND in stock, or restocked (out -> in).
  const alertProducts = [];
  let updated = 0;

  // Process in batches of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE).map((p) => ({
      store_name: p.store_name,
      store_id: p.store_id ?? null,
      title: p.title,
      price: p.price,
      url: normalizeProductUrl(p.url),
      image_url: p.image_url,
      in_stock: p.in_stock ?? true,
      game: p.game ?? 'pokemon',
      // Stamped on every sighting regardless of in_stock value — the staleness
      // sweep uses this (not just "missing from this run") to require a
      // sustained absence before flipping a product to out-of-stock.
      last_seen_at: new Date().toISOString(),
    }));

    const { error: upsertError, data } = await supabase
      .from('products')
      .upsert(batch, { onConflict: 'url' })
      .select();

    if (upsertError) {
      console.error(`  Upsert batch error: ${upsertError.message}`);
    } else if (data) {
      for (const row of data) {
        if (!existingUrls.has(row.url)) {
          insertedProducts.push(row);
          // New listing: alert only if it's actually in stock
          if (row.in_stock) alertProducts.push(row);
        } else {
          updated++;
          // Restock: was out of stock, now back in stock
          if (row.in_stock && prevStock.get(row.url) === false) {
            alertProducts.push(row);
          }
        }
      }
    }
  }

  // Staleness sweep: mark products out-of-stock only once they've been
  // continuously missing from their store's listing for a grace period, not
  // on the first miss. A single miss is often just a cart-hold blip on a
  // hot/low-quantity SKU (product briefly unavailable while someone's cart
  // reserves the last unit, then reappears when the hold expires) — flipping
  // in_stock on that first miss turns a normal reservation cycle into a
  // "restock" alert every time it comes back (confirmed on Noriel, ~15 min
  // check interval: 20+ repeat alerts/day for one item). Requiring absence to
  // outlast ~2 scrape cycles filters that out while still catching genuine
  // stock-outs within roughly half an hour.
  const STALE_GRACE_MS = 20 * 60 * 1000;

  if (scrapedStoreIds.length > 0) {
    console.log('\nRunning staleness sweep...');

    // Group scraped product URLs by store_id (normalized for consistent matching)
    const urlsByStore = new Map();
    for (const p of products) {
      if (!p.store_id) continue;
      if (!urlsByStore.has(p.store_id)) urlsByStore.set(p.store_id, []);
      urlsByStore.get(p.store_id).push(normalizeProductUrl(p.url));
    }

    let totalStale = 0;
    const staleCutoff = Date.now() - STALE_GRACE_MS;
    for (const storeId of scrapedStoreIds) {
      const scrapedUrlSet = new Set(urlsByStore.get(storeId) ?? []);

      // Fetch all currently in-stock products for this store
      const { data: storeProducts, error: fetchErr } = await fetchAllRows(() =>
        supabase.from('products').select('id, url, last_seen_at').eq('store_id', storeId).eq('in_stock', true),
      );

      if (fetchErr) {
        console.error(`  Staleness sweep fetch error for store ${storeId}: ${fetchErr.message}`);
        continue;
      }

      // Find products not seen in this scrape AND missing long enough to be
      // a real stock-out rather than a single-run blip.
      const staleIds = storeProducts
        .filter((p) => {
          if (scrapedUrlSet.has(normalizeProductUrl(p.url))) return false;
          const lastSeen = p.last_seen_at ? new Date(p.last_seen_at).getTime() : 0;
          return lastSeen <= staleCutoff;
        })
        .map((p) => p.id);

      if (staleIds.length === 0) continue;

      // Batch update stale products
      for (let j = 0; j < staleIds.length; j += BATCH_SIZE) {
        const idBatch = staleIds.slice(j, j + BATCH_SIZE);
        const { error: staleError } = await supabase
          .from('products')
          .update({ in_stock: false })
          .in('id', idBatch);

        if (staleError) {
          console.error(`  Staleness sweep update error for store ${storeId}: ${staleError.message}`);
        }
      }

      totalStale += staleIds.length;
      console.log(`  Store ${storeId}: ${staleIds.length} products marked stale (out-of-stock)`);
    }

    if (totalStale > 0) {
      console.log(`  Total stale: ${totalStale} products marked out-of-stock`);
    }
  }

  return { inserted: insertedProducts.length, updated, insertedProducts, alertProducts };
}

/**
 * Delete products that have been continuously out-of-stock for over a week.
 * The dashboard only ever shows in-stock (incl. preorder) products, so this is
 * pure cleanup, not a stock-accuracy feature — out_of_stock_since is stamped
 * by a DB trigger (see migration 021) on the real true->false transition, so
 * it doesn't get reset by every scrape that finds the same item still gone.
 *
 * Scoped to currently-ENABLED stores only. A disabled store's whole catalog
 * sits frozen at whatever state it was in when scraping stopped — that's not
 * a real "still out of stock" signal, and deleting it would mean the moment
 * the store is fixed and re-enabled, every one of its products comes back
 * with no matching row, and the "new product" alert fires for the entire
 * catalog at once. Products with no store_id (FK set NULL on store deletion)
 * are skipped for the same reason — we can't confirm the store is enabled.
 */
async function cleanupStaleProducts(supabase) {
  const CUTOFF_DAYS = 7;
  const cutoff = new Date(Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: enabledStores, error: storesError } = await supabase.from('stores').select('id').eq('is_enabled', true);
  if (storesError) {
    console.error(`  Cleanup: failed to fetch enabled stores — ${storesError.message}`);
    return;
  }
  const enabledIds = (enabledStores ?? []).map((s) => s.id);
  if (enabledIds.length === 0) return;

  const { data: deleted, error: deleteError } = await supabase
    .from('products')
    .delete()
    .eq('in_stock', false)
    .lt('out_of_stock_since', cutoff)
    .in('store_id', enabledIds)
    .select('id');

  if (deleteError) {
    console.error(`  Cleanup: delete failed — ${deleteError.message}`);
    return;
  }
  if (deleted && deleted.length > 0) {
    console.log(`  Cleanup: deleted ${deleted.length} product(s) out of stock for over ${CUTOFF_DAYS} days`);
  }
}

/**
 * Update scrape_run status in Supabase (for manual scraping tracking).
 */
async function updateScrapeRun(supabase, runId, updates) {
  if (!runId) return;
  const { error } = await supabase
    .from('scrape_runs')
    .update(updates)
    .eq('id', runId);
  if (error) console.error(`  Failed to update scrape_run: ${error.message}`);
}

/**
 * Escape HTML special characters to prevent XSS in email templates.
 */
function escapeHtml(s) {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitize URL: only allow http/https schemes to prevent javascript: injection.
 */
function sanitizeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return escapeHtml(url);
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Send email alerts for newly inserted products via Gmail SMTP (nodemailer).
 * Sends one message per recipient, then updates is_notified=true on success.
 */
/**
 * Resolve the list of recipient emails for alerts.
 * Prefers active rows in the `subscribers` table; falls back to the
 * comma-separated ALERT_EMAIL_TO env var for backward compatibility.
 */
async function getRecipients(supabase) {
  const { data, error } = await supabase
    .from('subscribers')
    .select('email')
    .eq('is_active', true);

  if (error) {
    console.error(`  Failed to load subscribers: ${error.message}`);
  } else if (data && data.length > 0) {
    return data.map((r) => r.email.trim()).filter(Boolean);
  }

  const fallback = process.env.ALERT_EMAIL_TO;
  if (fallback) {
    return fallback.split(',').map((e) => e.trim()).filter(Boolean);
  }
  return [];
}

async function sendAlerts(insertedProducts) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPass) {
    console.log('  GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping email alerts');
    return;
  }
  if (insertedProducts.length === 0) {
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass },
  });
  const supabase = initSupabase();

  const recipients = await getRecipients(supabase);
  if (recipients.length === 0) {
    console.log('  No active subscribers — skipping email alerts');
    return;
  }

  const productRows = insertedProducts
    .map(
      (p) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(p.store_name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">
            <a href="${sanitizeUrl(p.url)}" style="color:#0066cc;text-decoration:none">${escapeHtml(p.title)}</a>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">
            ${p.price != null ? `${p.price.toFixed(2)} RON` : 'N/A'}
          </td>
        </tr>`
    )
    .join('\n');

  const html = `
    <h2 style="font-family:sans-serif;color:#333">🃏 TCG Tracker — ${insertedProducts.length} Product${insertedProducts.length > 1 ? 's' : ''} In Stock</h2>
    <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Store</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Product</th>
          <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #ddd">Price</th>
        </tr>
      </thead>
      <tbody>
        ${productRows}
      </tbody>
    </table>
  `;

  const subject = `TCG Tracker: ${insertedProducts.length} product${insertedProducts.length > 1 ? 's' : ''} in stock`;

  // Send one email per recipient so addresses stay private (no shared To: line).
  let sentCount = 0;
  for (const email of recipients) {
    try {
      await transporter.sendMail({
        from: `TCG Tracker <${gmailUser}>`,
        to: email,
        subject,
        html,
      });
      sentCount++;
    } catch (sendError) {
      console.error(`  Email send to ${email} failed: ${sendError.message}`);
    }
  }

  if (sentCount === 0) {
    console.error('  All email sends failed — not marking products as notified');
    return;
  }

  console.log(`  Alert email sent to ${sentCount}/${recipients.length} recipient(s)`);

  const ids = insertedProducts.map((p) => p.id);
  const { error: updateError } = await supabase
    .from('products')
    .update({ is_notified: true })
    .in('id', ids);

  if (updateError) {
    console.error(`  Failed to update is_notified: ${updateError.message}`);
  } else {
    console.log(`  Marked ${ids.length} products as notified`);
  }
}

// Main entry point (only when run directly, not when imported for tests).
async function main() {
  const supabase = initSupabase();
  const runId = process.env.SCRAPE_RUN_ID;

  // Mark scrape run as running
  await updateScrapeRun(supabase, runId, { status: 'running' });

  try {
    const { products, scrapedStoreIds } = await scrapeAll();

    console.log('\nSyncing to Supabase...');
    const { inserted, updated, insertedProducts, alertProducts } = await syncToSupabase(products, scrapedStoreIds);
    console.log(`  Inserted: ${inserted} new products`);
    console.log(`  Updated: ${updated} existing products`);
    console.log(`  In stock / restocked (alertable): ${alertProducts.length}`);

    // Update scrape run with results
    await updateScrapeRun(supabase, runId, {
      status: 'completed',
      products_found: products.length,
      products_new: inserted,
      completed_at: new Date().toISOString(),
    });

    if (alertProducts.length > 0) {
      console.log('\nSending email alerts...');
      await sendAlerts(alertProducts);
    }

    console.log('\nCleaning up long-term out-of-stock products...');
    await cleanupStaleProducts(supabase);
  } catch (err) {
    console.error(`  Scraper failed: ${err.message}`);
    await updateScrapeRun(supabase, runId, {
      status: 'failed',
      error_message: err.message,
      completed_at: new Date().toISOString(),
    });
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

export { scrapeAll, scrapeShopify, scrapeSmyk, scrapeOzone, scrapeWooCommerce, scrapeDexHitApi, scrapeFlameyApi, scrapePokemania, fetchStoreData, fetchStores, syncToSupabase, sendAlerts, cleanupStaleProducts };
