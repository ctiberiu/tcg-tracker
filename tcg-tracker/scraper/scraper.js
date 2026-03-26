import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

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
  shopify: scrapeShopify,
  hobby_planet: scrapeHobbyPlanet,
  regatul_jocurilor: scrapeRegatulJocurilor,
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

  return page.evaluate((storeName, storeId) => {
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
      const titleEl = el.querySelector(`a[class*="_productUrl_${id}"], a[href*=".html"]`);
      const priceEl = el.querySelector(`[class*="price"][class*="${id}"], [class*="price"]`);
      const imgEl = el.querySelector('img[data-lazy-src], img[data-src], img[src]');
      const linkEl = el.querySelector(`a[class*="_productUrl_${id}"], a[href*=".html"]`);

      const priceText = priceEl?.textContent?.trim() ?? '';
      const priceMatch = priceText.match(/([\d.,]+)\s*(RON|lei)/i);
      let price = null;
      if (priceMatch) {
        price = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
      }

      const imgSrc = imgEl?.getAttribute('data-lazy-src') ?? imgEl?.getAttribute('data-src') ?? imgEl?.getAttribute('src');

      // Out-of-stock: Gomag uses .stock-status.unavailable or "Stoc epuizat" text
      const unavailable = el.querySelector('.stock-status.unavailable');
      const epuizat = Array.from(el.querySelectorAll('span, div')).some(
        (s) => s.textContent?.trim() === 'Stoc epuizat' || s.textContent?.trim() === 'Indisponibil'
      );
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
  }, store.name, store.id);
}

/**
 * Shopify stores (RedGoblin, TCGarena)
 * Products have h2 or h3 headings with links to /products/.
 */
async function scrapeShopify(page, store) {
  await page.waitForSelector('a[href*="/products/"]', { timeout: 15000 });

  return page.evaluate((storeName, storeId) => {
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
    const cards = document.querySelectorAll('[class*="product-card"], [class*="grid-product"], .product-item, [class*="grid-item"], li');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const titleEl = card.querySelector('h2 a[href*="/products/"], h3 a[href*="/products/"]');
      if (!titleEl) continue;

      const title = titleEl.textContent?.trim();
      const url = titleEl.href?.startsWith('/') ? baseUrl + titleEl.href : titleEl.href;
      if (seen.has(url)) continue;
      seen.add(url);

      // Price: more permissive regex (no ^ anchor)
      const priceEls = card.querySelectorAll('[class*="price"], ins, span, div');
      let price = null;
      for (const el of priceEls) {
        const text = el.textContent?.trim();
        const match = text?.match(/([\d.,]+)\s*(lei|RON)/i);
        if (match) {
          const raw = match[1];
          if (raw.includes(',')) {
            price = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
          } else {
            price = parseFloat(raw);
          }
          break;
        }
      }

      // Image: expanded selectors, prefer data-srcset/data-src for lazy-loaded
      const imgEl = card.querySelector('img[data-srcset], img[data-src], img[src*="cdn.shopify"], img[srcset], figure img, img');
      let imgSrc = imgEl?.getAttribute('data-src')
        ?? imgEl?.getAttribute('src')
        ?? imgEl?.getAttribute('data-srcset')?.split(' ')[0]
        ?? imgEl?.getAttribute('srcset')?.split(' ')[0]
        ?? null;

      // Out-of-stock: Shopify uses .productitem__badge--soldout badge
      const soldOut = !!card.querySelector('.productitem__badge--soldout, [class*="sold-out"], [class*="soldout"]');

      if (title && url) {
        results.push({
          title,
          price,
          url,
          image_url: normalizeImageUrl(imgSrc, baseUrl),
          store_name: storeName,
          store_id: storeId,
          in_stock: !soldOut,
        });
      }
    }

    return results;
  }, store.name, store.id);
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

  return page.evaluate((storeName, storeId) => {
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
  }, store.name, store.id);
}

/**
 * RegatulJocurilor.ro — PrestaShop platform
 * Only scrapes actual search result rows (li.product_item), not featured sections.
 * Filters to Pokemon TCG products only (excludes backpacks, toys, etc.).
 */
async function scrapeRegatulJocurilor(page, store) {
  try {
    await page.waitForSelector('li.product_item', { timeout: 15000 });
  } catch {
    console.log(`  ${store.name}: No products found or page timed out`);
    return [];
  }

  return page.evaluate((storeName, storeId) => {
    function normalizeImageUrl(src, base) {
      if (!src) return null;
      src = src.trim();
      if (src.startsWith('data:')) return null;
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) return base + src;
      if (src.startsWith('http')) return src;
      return base + '/' + src;
    }
    // Only TCG-related products (cards, boosters, decks, accessories)
    const TCG_KEYWORDS = ['tcg', 'booster', 'deck', 'tin', 'pack', 'binder', 'portfolio', 'trainer', 'elite', 'promo', 'starter', 'collection box', 'battle box', 'ultra pro', 'card'];
    function isTcgProduct(title) {
      const t = title.toLowerCase();
      return TCG_KEYWORDS.some((kw) => t.includes(kw));
    }

    const baseUrl = 'https://regatuljocurilor.ro';
    // Use li.product_item to scope to actual search results only
    const items = document.querySelectorAll('li.product_item');
    const results = [];
    const seen = new Set();

    for (const item of items) {
      const titleEl = item.querySelector('.product-title a, h3 a, h2 a, h1 a');
      if (!titleEl) continue;

      const title = titleEl.textContent?.trim();
      if (!title) continue;

      // Skip non-TCG items (backpacks, toys, labyrinth, etc.)
      if (!isTcgProduct(title)) continue;

      const url = titleEl.href?.startsWith('/') ? baseUrl + titleEl.href : titleEl.href;
      if (seen.has(url)) continue;
      seen.add(url);

      // Price
      let price = null;
      const priceEl = item.querySelector('.product-price .price, [class*="price"] .price, [class*="price"]');
      if (priceEl) {
        const match = priceEl.textContent?.trim()?.match(/([\d.,]+)\s*(RON|lei)/i);
        if (match) {
          price = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
        }
      }

      // Image
      const imgEl = item.querySelector('img[data-src], img[src*="img/p/"], img');
      const imgSrc = imgEl?.getAttribute('data-src') ?? imgEl?.getAttribute('src');

      // In-stock: div.stock text — "Nu este momentan in stoc" = out of stock
      const stockEl = item.querySelector('div.stock');
      const stockText = stockEl?.textContent?.trim() ?? '';
      const in_stock = !stockText.includes('Nu este momentan');

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
  }, store.name, store.id);
}

/**
 * Main scraper — fetches stores from DB, iterates, collects products.
 */
async function scrapeAll() {
  const supabase = initSupabase();
  const stores = await fetchStores(supabase);

  if (stores.length === 0) {
    console.log('No stores to scrape');
    return [];
  }

  const browser = await chromium.launch({ headless: true });
  const allProducts = [];

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
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      const products = await scrapeFn(page, store);
      allProducts.push(...products);

      console.log(`  ${store.name}: ${products.length} products found`);
      await context.close();
    } catch (err) {
      console.error(`  ${store.name}: ERROR — ${err.message}`);
    }
  }

  await browser.close();

  console.log(`\nTotal: ${allProducts.length} products scraped`);
  return allProducts;
}

/**
 * Sync scraped products to Supabase using upsert on URL.
 * Updates price, image_url, in_stock for existing products.
 * Returns { inserted, updated, insertedProducts } for alert use.
 */
async function syncToSupabase(products) {
  const supabase = initSupabase();

  // Fetch existing URLs to distinguish new vs updated
  const { data: existing, error: fetchError } = await supabase
    .from('products')
    .select('url');

  if (fetchError) {
    throw new Error(`Failed to fetch existing products: ${fetchError.message}`);
  }

  const existingUrls = new Set(existing.map((row) => row.url));
  const insertedProducts = [];
  let updated = 0;

  // Process in batches of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE).map((p) => ({
      store_name: p.store_name,
      store_id: p.store_id ?? null,
      title: p.title,
      price: p.price,
      url: p.url,
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
        } else {
          updated++;
        }
      }
    }
  }

  return { inserted: insertedProducts.length, updated, insertedProducts };
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
 * Send batched email alert for newly inserted products via Resend API.
 * Updates is_notified=true for each product after successful send.
 */
async function sendAlerts(insertedProducts) {
  const apiKey = process.env.RESEND_API_KEY;
  const alertTo = process.env.ALERT_EMAIL_TO;

  if (!apiKey) {
    console.log('  RESEND_API_KEY not set — skipping email alerts');
    return;
  }
  if (!alertTo) {
    console.log('  ALERT_EMAIL_TO not set — skipping email alerts');
    return;
  }
  if (insertedProducts.length === 0) {
    return;
  }

  const resend = new Resend(apiKey);
  const supabase = initSupabase();

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
    <h2 style="font-family:sans-serif;color:#333">🃏 TCG Tracker — ${insertedProducts.length} New Product${insertedProducts.length > 1 ? 's' : ''} Found</h2>
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

  const { error: sendError } = await resend.emails.send({
    from: 'TCG Tracker <onboarding@resend.dev>',
    to: [alertTo],
    subject: `TCG Tracker: ${insertedProducts.length} new product${insertedProducts.length > 1 ? 's' : ''} detected`,
    html,
  });

  if (sendError) {
    console.error(`  Email send failed: ${sendError.message}`);
    return;
  }

  console.log(`  Alert email sent to ${alertTo}`);

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
  const products = await scrapeAll();

  console.log('\nSyncing to Supabase...');
  const { inserted, updated, insertedProducts } = await syncToSupabase(products);
  console.log(`  Inserted: ${inserted} new products`);
  console.log(`  Updated: ${updated} existing products`);

  // Update scrape run with results
  await updateScrapeRun(supabase, runId, {
    status: 'completed',
    products_found: products.length,
    products_new: inserted,
    completed_at: new Date().toISOString(),
  });

  if (insertedProducts.length > 0) {
    console.log('\nSending email alerts...');
    await sendAlerts(insertedProducts);
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
