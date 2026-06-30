import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

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
  shopify: scrapeShopify,
  hobby_planet: scrapeHobbyPlanet,
  regatul_jocurilor: scrapeRegatulJocurilor,
  magento: scrapeMagento,
  krit: scrapeKrit,
  smyk: scrapeSmyk,
  ozone: scrapeOzone,
  woocommerce: scrapeWooCommerce,
  lumea_jocurilor: scrapeLumeaJocurilor,
  raijucarii: scrapeRaijucarii,
  tulli: scrapeTulli,
  bebetei: scrapeBebetei,
  carturesti: scrapeCarturesti,
  foon: scrapeFoon,
};

/**
 * Fetch stores from Supabase. If SCRAPE_STORE_ID is set, fetch only that store.
 */
async function fetchStores(supabase) {
  const storeId = process.env.SCRAPE_STORE_ID;
  let query = supabase.from('stores').select('*');

  if (storeId) {
    query = query.eq('id', storeId);
  } else {
    query = query.eq('is_enabled', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch stores: ${error.message}`);
  return data;
}

/**
 * Pokemonia.ro — Gomag platform
 * Products use [data-product-id] containers.
 */
async function scrapePokemonia(page, store) {
  await page.waitForSelector('[data-product-id]', { timeout: 15000 });

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
        price = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
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

/**
 * Shopify stores (RedGoblin, TCGarena, Guildhall)
 * Uses the Shopify JSON API (/products.json) for reliable product data and stock status.
 */
async function scrapeShopify(_page, store) {
  const baseUrl = new URL(store.url).origin;
  const jsonUrl = store.url.replace(/\?.*$/, '').replace(/\/$/, '') + '/products.json?limit=250';

  try {
    const res = await fetch(jsonUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TCGTracker/1.0)' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    return data.products.map((product) => ({
      title: product.title,
      price: product.variants?.[0]?.price ? parseFloat(product.variants[0].price) : null,
      url: baseUrl + '/products/' + product.handle,
      image_url: product.images?.[0]?.src ?? null,
      store_name: store.name,
      store_id: store.id,
      in_stock: product.variants?.some((v) => v.available) ?? false,
    }));
  } catch (err) {
    console.log(`  ${store.name}: Shopify JSON API failed (${err.message})`);
    return [];
  }
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
          price = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
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
          price = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
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
          price = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
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
 * Smyk.ro — custom React platform
 * Products use a.complex-product__link-wrapper as card elements.
 */
async function scrapeSmyk(page, store) {
  try {
    await page.waitForSelector('a.complex-product__link-wrapper', { timeout: 15000 });
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
    const cards = document.querySelectorAll('a.complex-product__link-wrapper');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const title = card.querySelector('.complex-product__name')?.textContent?.trim();
      if (!title) continue;

      const url = card.href?.startsWith('/') ? baseUrl + card.href : card.href;
      if (!url || seen.has(url)) continue;
      seen.add(url);

      let price = null;
      const priceEl = card.querySelector('.price--new, .complex-product__price');
      if (priceEl) {
        const match = priceEl.textContent?.trim()?.match(/([\d.,]+)\s*(lei|LEI|RON)/i);
        if (match) {
          price = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
        }
      }

      const imgEl = card.querySelector('img[data-testid="image"], img');
      const imgSrc = imgEl?.src;

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
}

/**
 * Ozone.ro — Magento with FastSimon search overlay
 * Products use .product-card with schema.org structured data.
 */
async function scrapeOzone(page, store) {
  try {
    await page.waitForSelector('.product-card', { timeout: 15000 });
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
    const cards = document.querySelectorAll('.product-card');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const nameMeta = card.querySelector('meta[itemprop="name"]');
      const urlMeta = card.querySelector('meta[itemprop="url"]');
      const priceMeta = card.querySelector('meta[itemprop="price"]');
      const availMeta = card.querySelector('meta[itemprop="availability"]');
      const imgEl = card.querySelector('img');

      const title = nameMeta?.content || imgEl?.alt;
      const url = urlMeta?.content || card.querySelector('a[href*="/product"]')?.href;
      if (!title || !url || seen.has(url)) continue;
      seen.add(url);

      const price = priceMeta?.content ? parseFloat(priceMeta.content) : null;
      const imgSrc = imgEl?.src;
      const in_stock = availMeta?.content?.includes('InStock') ?? true;

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
 * DexHit.ro — WooCommerce platform
 * Products use article or div elements with .outofstock class for stock.
 */
async function scrapeWooCommerce(page, store) {
  try {
    await page.waitForSelector('li.product, ul.products li.product', { timeout: 15000 });
  } catch {
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
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
          price = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
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
          price = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
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
      if (m) price = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));

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
      if (m) price = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));

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
          price = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
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
      if (m) price = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));

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
 * Returns true if the product title contains "TCG", "carti", or "cards" (case-insensitive).
 * Simple keyword filter to keep only relevant trading card game products.
 */
function isTcgProduct(title) {
  if (!title) return false;
  if (/binder|sleeve|alcove/i.test(title)) return false;
  return /tcg|carti|cards|booster|blister|trainer/i.test(title);
}

/**
 * Main scraper — fetches stores from DB, iterates, collects products.
 */
async function scrapeAll() {
  const supabase = initSupabase();
  const stores = await fetchStores(supabase);

  if (stores.length === 0) {
    console.log('No stores to scrape');
    return { products: [], scrapedStoreIds: [] };
  }

  const browser = await chromium.launch({ headless: true });
  const allProducts = [];
  const scrapedStoreIds = [];

  for (const store of stores) {
    const scrapeFn = SCRAPER_MAP[store.scraper_type];
    if (!scrapeFn) {
      console.error(`  ${store.name}: Unknown scraper type "${store.scraper_type}"`);
      continue;
    }

    try {
      console.log(`Scraping ${store.name}...`);
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();

      await page.goto(store.url, {
        waitUntil: 'load',
        timeout: 30000,
      });

      const raw = await scrapeFn(page, store);
      const products = raw.filter((p) => isTcgProduct(p.title));
      allProducts.push(...products);
      scrapedStoreIds.push(store.id);

      console.log(`  ${store.name}: ${products.length} TCG products found (${raw.length - products.length} non-TCG filtered)`);
      await context.close();
    } catch (err) {
      console.error(`  ${store.name}: ERROR — ${err.message}`);
    }
  }

  await browser.close();

  console.log(`\nTotal: ${allProducts.length} products scraped`);
  return { products: allProducts, scrapedStoreIds };
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
  const { data: existing, error: fetchError } = await supabase
    .from('products')
    .select('url, in_stock');

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

  // Staleness sweep: mark products not seen in this scrape as out-of-stock
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
    for (const storeId of scrapedStoreIds) {
      const scrapedUrlSet = new Set(urlsByStore.get(storeId) ?? []);

      // Fetch all currently in-stock products for this store
      const { data: storeProducts, error: fetchErr } = await supabase
        .from('products')
        .select('id, url')
        .eq('store_id', storeId)
        .eq('in_stock', true);

      if (fetchErr) {
        console.error(`  Staleness sweep fetch error for store ${storeId}: ${fetchErr.message}`);
        continue;
      }

      // Find products not seen in this scrape
      const staleIds = storeProducts
        .filter((p) => !scrapedUrlSet.has(normalizeProductUrl(p.url)))
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

// Main entry point
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
} catch (err) {
  console.error(`  Scraper failed: ${err.message}`);
  await updateScrapeRun(supabase, runId, {
    status: 'failed',
    error_message: err.message,
    completed_at: new Date().toISOString(),
  });
  process.exit(1);
}

export { scrapeAll, syncToSupabase, sendAlerts };
