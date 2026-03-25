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

const STORES = [
  {
    name: 'Pokemonia',
    url: 'https://www.pokemonia.ro/produse-1',
    scrape: scrapePokemonia,
  },
  {
    name: 'RedGoblin',
    url: 'https://redgoblin.ro/collections/pokemon',
    scrape: scrapeShopify,
  },
  {
    name: 'TCGarena',
    url: 'https://tcgarena.ro/collections/joc-de-carti-pokemon-tcg-romania',
    scrape: scrapeShopify,
  },
  {
    name: 'Hobby-Planet',
    url: 'https://www.hobby-planet.ro/catalog/q/Pokemon',
    scrape: scrapeHobbyPlanet,
  },
  {
    name: 'RegatulJocurilor',
    url: 'https://regatuljocurilor.ro/ro/cautare?controller=search&s=pokemon',
    scrape: scrapeRegatulJocurilor,
  },
];

/**
 * Pokemonia.ro — Gomag platform
 * Products use [data-product-id] containers.
 */
async function scrapePokemonia(page, storeName) {
  await page.waitForSelector('[data-product-id]', { timeout: 15000 });

  return page.evaluate((store) => {
    const items = document.querySelectorAll('[data-product-id]');
    return Array.from(items).map((el) => {
      const id = el.dataset.productId;
      const titleEl = el.querySelector(`a[class*="_productUrl_${id}"]`);
      const priceEl = el.querySelector(`[class*="price"][class*="${id}"]`);
      const imgEl = el.querySelector('img[data-src], img[src]');
      const linkEl = el.querySelector(`a[class*="_productUrl_${id}"], a[href*=".html"]`);

      const priceText = priceEl?.textContent?.trim() ?? '';
      const priceMatch = priceText.match(/([\d.,]+)\s*(RON|lei)/i);
      let price = null;
      if (priceMatch) {
        price = parseFloat(
          priceMatch[1].replace(/\./g, '').replace(',', '.')
        );
      }

      return {
        title: titleEl?.textContent?.trim() ?? null,
        price,
        url: linkEl?.href ?? null,
        image_url: imgEl?.getAttribute('data-src') ?? imgEl?.getAttribute('src') ?? null,
        store_name: store,
      };
    }).filter((p) => p.title && p.url);
  }, storeName);
}

/**
 * Shopify stores (RedGoblin, TCGarena)
 * Products have h2 or h3 headings with links to /products/.
 */
async function scrapeShopify(page, storeName) {
  await page.waitForSelector('a[href*="/products/"]', { timeout: 15000 });

  return page.evaluate((store) => {
    const baseUrl = window.location.origin;
    const cards = document.querySelectorAll('li, [class*="product-card"], [class*="grid-item"]');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const titleEl = card.querySelector('h2 a[href*="/products/"], h3 a[href*="/products/"]');
      if (!titleEl) continue;

      const title = titleEl.textContent?.trim();
      const url = titleEl.href?.startsWith('/') ? baseUrl + titleEl.href : titleEl.href;
      if (seen.has(url)) continue;
      seen.add(url);

      // Price: look for text matching price pattern
      const priceEls = card.querySelectorAll('[class*="price"], ins, status ins, span, div');
      let price = null;
      for (const el of priceEls) {
        const text = el.textContent?.trim();
        const match = text?.match(/^([\d.,]+)\s*(lei|RON)/i);
        if (match) {
          const raw = match[1];
          // Handle both "1.200,00" (RO) and "230.00" (EN) formats
          if (raw.includes(',')) {
            price = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
          } else {
            price = parseFloat(raw);
          }
          break;
        }
      }

      // Image
      const imgEl = card.querySelector('img[src*="cdn.shopify"], img[srcset], figure img');
      const image_url = imgEl?.getAttribute('src') ?? imgEl?.getAttribute('srcset')?.split(' ')[0] ?? null;

      if (title && url) {
        results.push({ title, price, url, image_url, store_name: store });
      }
    }

    return results;
  }, storeName);
}

/**
 * Hobby-Planet.ro — MerchantPro platform
 * Product cards with links containing /cumpara/ and price in RON.
 */
async function scrapeHobbyPlanet(page, storeName) {
  // Check if "no results" message is present
  const noResults = await page.$('text=nu a intors niciun rezultat');
  if (noResults) {
    console.log(`  ${storeName}: No Pokemon products found in catalog`);
    return [];
  }

  await page.waitForSelector('a[href*="/cumpara/"]', { timeout: 15000 });

  return page.evaluate((store) => {
    const links = document.querySelectorAll('a[href*="/cumpara/"]');
    const seen = new Set();
    const results = [];

    for (const link of links) {
      const url = link.href;
      if (seen.has(url) || !link.querySelector('img')) continue;
      seen.add(url);

      const card = link.closest('[class]')?.parentElement;
      if (!card) continue;

      // Title from the second link with same href (text link)
      const titleLink = card.querySelector(`a[href="${link.getAttribute('href')}"]:not(:has(img))`);
      const title = titleLink?.textContent?.trim() ?? link.getAttribute('aria-label') ?? link.querySelector('img')?.alt ?? null;

      // Price
      let price = null;
      const priceEls = card.querySelectorAll('div, span');
      for (const el of priceEls) {
        const match = el.textContent?.trim()?.match(/^([\d.,]+)\s*RON$/i);
        if (match) {
          price = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
          break;
        }
      }

      // Image
      const imgEl = link.querySelector('img') ?? card.querySelector('img');
      const image_url = imgEl?.src ?? null;

      if (title) {
        results.push({ title, price, url, image_url, store_name: store });
      }
    }

    return results;
  }, storeName);
}

/**
 * RegatulJocurilor.ro — PrestaShop platform
 * Uses search results page with product links and price spans.
 */
async function scrapeRegatulJocurilor(page, storeName) {
  // Wait for either products or "no results"
  try {
    await page.waitForSelector('a[href*="/ro/acasa/"], a[href*="/ro/"][href*="pokemon"]', { timeout: 15000 });
  } catch {
    console.log(`  ${storeName}: No products found or page timed out`);
    return [];
  }

  return page.evaluate((store) => {
    const baseUrl = 'https://regatuljocurilor.ro';
    // PrestaShop search results: product items with title links and price
    const productContainers = document.querySelectorAll('[class*="product"], article, .ajax_block_product, li[class*="product"]');
    const results = [];
    const seen = new Set();

    for (const container of productContainers) {
      const titleEl = container.querySelector('h1 a, h2 a, h3 a, .product-title a, a[class*="product_name"], a[class*="product-name"]');
      if (!titleEl) continue;

      const url = titleEl.href?.startsWith('/') ? baseUrl + titleEl.href : titleEl.href;
      if (seen.has(url)) continue;
      seen.add(url);

      const title = titleEl.textContent?.trim();

      // Price
      let price = null;
      const priceEl = container.querySelector('[class*="price"], .product-price');
      if (priceEl) {
        const match = priceEl.textContent?.trim()?.match(/([\d.,]+)\s*(RON|lei)/i);
        if (match) {
          price = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
        }
      }

      // Image
      const imgEl = container.querySelector('img[src*="img/p/"], img[data-src], img');
      const image_url = imgEl?.getAttribute('data-src') ?? imgEl?.getAttribute('src') ?? null;

      if (title && url) {
        results.push({ title, price, url, image_url, store_name: store });
      }
    }

    return results;
  }, storeName);
}

/**
 * Main scraper — iterates all stores, collects products, handles errors per store.
 */
async function scrapeAll() {
  const browser = await chromium.launch({ headless: true });
  const allProducts = [];

  for (const store of STORES) {
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

      const products = await store.scrape(page, store.name);
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
 * Sync scraped products to Supabase.
 * Checks existing URLs to avoid duplicates, inserts new products.
 * Returns { inserted, skipped, insertedProducts } with full rows for alert use.
 */
async function syncToSupabase(products) {
  const supabase = initSupabase();

  // Fetch all existing URLs in one query
  const { data: existing, error: fetchError } = await supabase
    .from('products')
    .select('url');

  if (fetchError) {
    throw new Error(`Failed to fetch existing products: ${fetchError.message}`);
  }

  const existingUrls = new Set(existing.map((row) => row.url));

  const newProducts = products.filter((p) => !existingUrls.has(p.url));
  const insertedProducts = [];
  let skipped = products.length - newProducts.length;

  if (newProducts.length > 0) {
    // Insert in batches of 50 to avoid payload limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < newProducts.length; i += BATCH_SIZE) {
      const batch = newProducts.slice(i, i + BATCH_SIZE).map((p) => ({
        store_name: p.store_name,
        title: p.title,
        price: p.price,
        url: p.url,
        image_url: p.image_url,
        is_notified: false,
      }));

      const { error: insertError, data } = await supabase
        .from('products')
        .insert(batch)
        .select();

      if (insertError) {
        console.error(`  Insert batch error: ${insertError.message}`);
      } else {
        insertedProducts.push(...data);
      }
    }
  }

  return { inserted: insertedProducts.length, skipped, insertedProducts };
}

/**
 * Escape HTML special characters to prevent XSS in email templates.
 * Scraped product data is untrusted external input.
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

  // Build batched HTML email body
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

  // Mark all alerted products as notified
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
const products = await scrapeAll();

if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  console.log('\nSyncing to Supabase...');
  try {
    const { inserted, skipped, insertedProducts } = await syncToSupabase(products);
    console.log(`  Inserted: ${inserted} new products`);
    console.log(`  Skipped: ${skipped} existing products`);

    if (insertedProducts.length > 0) {
      console.log('\nSending email alerts...');
      await sendAlerts(insertedProducts);
    }
  } catch (err) {
    console.error(`  Supabase sync failed: ${err.message}`);
  }
} else {
  console.log('\nSUPABASE_URL/SUPABASE_KEY not set — skipping DB sync');
  console.log(JSON.stringify(products, null, 2));
}

export { scrapeAll, syncToSupabase, sendAlerts };
