/**
 * Request filtering for scraped shop pages.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 * The scraper loads every shop page fully, so the runner executes all the
 * third-party JS those shops embed — ad networks, analytics, tag managers, chat
 * widgets. The threat model is not "one of 28 Romanian card shops is
 * compromised", it is "any vendor any of those shops embeds is compromised",
 * which is a far larger surface and reaches us without anyone touching the shop.
 *
 * That matters because the runner holds the service-role SUPABASE_KEY — which
 * bypasses every policy migration 033 added — plus GMAIL_APP_PASSWORD and
 * ZEPTOMAIL_TOKEN. The chain is hostile third-party JS → Chromium sandbox escape
 * → runner env → total DB control and our sending identity. Low probability,
 * total impact.
 *
 * ── The risk this code carries is the opposite one ───────────────────────────
 * Over-blocking is far more likely than a sandbox escape, and it fails in a
 * particularly nasty way. Commit 9bf84aa made scrapeAtuToys return `[]`;
 * classifyOutcome reads empty as a block; 17 strikes later the store
 * auto-disabled while its page was serving 15 products the whole time. Blocking
 * the script that renders a client-rendered shop produces exactly that — a store
 * that renders nothing, reads as blocked, and switches itself off.
 *
 * So this is deliberately conservative, and it has two modes:
 *
 *   'assets'    block image/font/media only. Origin-independent, and these are
 *               passive resources that cannot affect extraction. Default.
 *   'crosssite' additionally block cross-site subresources — scripts, xhr, etc.
 *
 * ── Why 'assets' is the default, and the security claim is narrower than it
 *    first appears ──────────────────────────────────────────────────────────
 * Blocking image/font/media buys bandwidth, fewer third-party connections and a
 * smaller network surface. It does NOT meaningfully mitigate hostile JS, because
 * passive assets do not execute. The type that carries the execution risk is
 * `script` — and blocking cross-site scripts is precisely what breaks shops
 * whose rendering code is served from a platform domain rather than their own.
 * That is not hypothetical here: scraper.js documents pokemania.ro as a
 * "distinct cdnmp.net platform", so its own rendering JS is cross-site.
 *
 * So the two goals are in direct tension, and 'crosssite' must be justified by
 * measurement rather than by argument. It exists so the before/after run can
 * quantify what it breaks; it is off unless explicitly switched on.
 *
 * ── What is NOT blocked, and why it would be the subtle killer ──────────────
 * `stylesheet` is never blocked, in either mode. Playwright's waitForSelector()
 * defaults to state:'visible', and all 14 DOM scrapers call it with only a
 * timeout — visibility is computed from CSS. Block stylesheets and an element
 * the site's CSS reveals never becomes visible, waitForSelector times out, the
 * swallow-catch returns [], classifyOutcome reads empty as a block, and the
 * store auto-disables 12h later while serving product the whole time. That is
 * the 9bf84aa failure reached through a different door, and it looks completely
 * harmless in review.
 */

/**
 * Resource types that cannot affect what we extract.
 *
 * We read image URLs from the DOM `src`/`data-src` attribute, never from the
 * decoded image, so aborting the request leaves the attribute — and therefore
 * `imageUrl` — intact. Fonts and media affect only rendering.
 *
 * Deliberately NOT blocked: `stylesheet`. Some scrapers key off computed layout
 * or visibility, and CSS is cheap relative to the risk of a subtle extraction
 * change.
 */
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'font', 'media']);

/**
 * Types allowed unconditionally, in EVERY mode, whatever their origin.
 *
 * This list is load-bearing and must be checked BEFORE any origin logic — an
 * earlier draft of this file omitted it, and cross-site stylesheets were blocked
 * in crosssite mode despite the doc comment claiming they never are. The unit
 * test caught it; review had not.
 *
 * `document`  — filtering the navigation itself makes a store read as a hard
 *               failure rather than a filtered one.
 * `stylesheet`— see the header: waitForSelector defaults to state:'visible' and
 *               all 16 calls in scraper.js rely on that default, so visibility
 *               is computed from CSS. No stylesheet, no visible element, empty
 *               result, `block`, auto-disable. Do not add `stylesheet` to the
 *               blocked list for the bandwidth; the bandwidth is not worth a
 *               store switching itself off 12 hours later.
 */
const ALWAYS_ALLOWED_RESOURCE_TYPES = new Set(['document', 'stylesheet']);

/**
 * The registrable domain, approximately: the last two labels.
 *
 * Deliberately naive, and adequate for this store set — every shop is on a
 * single-label TLD (`.ro`, `.com`, `.net`). A multi-part suffix like `.co.uk`
 * would be treated as the registrable domain and would make the same-site check
 * too permissive, not too strict, so it fails toward keeping stores working
 * rather than breaking them. Revisit if a shop on such a suffix is ever added.
 */
export function registrableDomain(hostname) {
  const labels = String(hostname ?? '').toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  return labels.slice(-2).join('.');
}

/** True when `requestHost` is the store's domain or any subdomain of it. */
export function isSameSite(storeHost, requestHost) {
  const a = registrableDomain(storeHost);
  const b = registrableDomain(requestHost);
  return a !== '' && a === b;
}

/**
 * Decide whether a request should be allowed.
 *
 * Same-site is judged on the registrable domain rather than exact origin,
 * because many shops serve their OWN rendering code from a CDN subdomain
 * (`cdn.shop.ro`, `static.shop.ro`). An exact-origin check would block the
 * script that draws the products, which looks identical to a blocked store.
 *
 * @returns {{ allow: boolean, reason: string }} reason is for logging — the
 *   whole point of this change is being able to see what it did.
 */
export function shouldAllowRequest(storeUrl, requestUrl, resourceType, mode = 'assets') {
  if (ALWAYS_ALLOWED_RESOURCE_TYPES.has(resourceType)) {
    return { allow: true, reason: `always-allowed:${resourceType}` };
  }

  if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
    return { allow: false, reason: `resource-type:${resourceType}` };
  }

  let storeHost;
  let requestHost;
  try {
    storeHost = new URL(storeUrl).hostname;
  } catch {
    // Unparseable store URL — allow everything rather than break a store over a
    // filtering decision. Fail open, deliberately: this module must never be the
    // reason a shop stops scraping.
    return { allow: true, reason: 'store-url-unparseable' };
  }
  try {
    requestHost = new URL(requestUrl).hostname;
  } catch {
    return { allow: true, reason: 'request-url-unparseable' };
  }

  if (mode !== 'crosssite') {
    return { allow: true, reason: 'assets-mode:not-a-blocked-type' };
  }

  // data:, blob: and about: parse as valid URLs but have no hostname, so the
  // same-site comparison below would treat them as cross-site and block them.
  // Allow them: they carry no third-party network contact, which is what this
  // mode exists to reduce. Fail open, per the module's stated principle.
  if (requestHost === '') {
    return { allow: true, reason: 'no-host (data:/blob:/about:)' };
  }

  if (isSameSite(storeHost, requestHost)) {
    return { allow: true, reason: 'same-site' };
  }

  return { allow: false, reason: 'cross-site' };
}
