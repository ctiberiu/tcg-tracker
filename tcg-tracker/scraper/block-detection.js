// Pure, side-effect-free helpers for scraper hardening (unit-testable without a
// live scrape). Used by scraper.js. Kept separate so importing them in tests
// doesn't run the scraper's top-level entrypoint.

/**
 * Standard, NON-identifying browser User-Agent. Never put the tool name/version
 * in request headers — that is trivial for a site owner to block. Used for both
 * the Shopify JSON fetch and the Playwright browser context so they're consistent.
 */
export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Auto-disable a store after this many CONSECUTIVE block-like failures. */
export const BLOCK_DISABLE_THRESHOLD = 5;

/** Anti-bot / access-denied text markers on a page body (a block, not a normal store page). */
// SPECIFIC challenge-page phrases only. Bare `cloudflare`/`captcha` were removed
// after they caused false positives on healthy HTTP-200 pages (a CDN link
// `cdnjs.cloudflare.com`, Cloudflare's email-obfuscation script, a hidden
// reCAPTCHA form-validation string, a Magento captcha-config JSON, etc.). The
// real challenge signal is the DOM widget check in fetchStoreData (an actual
// challenges.cloudflare.com iframe / .cf-turnstile / .g-recaptcha element) plus
// HTTP 403/429 — this text check is only a supplementary, low-false-positive net.
const CHALLENGE_RE =
  /nu sunt robot|verificare de securitate|verifică că ești om|access denied|attention required|are you a human|verify you are human|ddos-guard|just a moment\.\.\.|checking if the site connection is secure|enable javascript and cookies to continue/i;

/** True if page text looks like a CAPTCHA / anti-bot challenge / block wall. */
export function detectChallengeText(text) {
  return CHALLENGE_RE.test(String(text ?? ''));
}

/**
 * Classify a store's scrape outcome from observable, non-DOM-injection signals.
 * @param {{ status?: number, challenged?: boolean, rawCount?: number, confirmedEmpty?: boolean }} sig
 *   status    HTTP status of the store's page/API (0/undefined if unknown)
 *   challenged CAPTCHA/anti-bot markers seen on the page
 *   rawCount  number of products the scraper extracted BEFORE TCG filtering
 *   confirmedEmpty  the scraper POSITIVELY confirmed the site's own "no results"
 *             signal (e.g. a dedicated empty-search page) — a legitimately empty
 *             search, NOT a failure. Opt-in per scraper; default false leaves every
 *             other store's behavior unchanged.
 * @returns {"block" | "success"}
 *   "block" = 403/429, a challenge wall, or a total failure to find ANY product
 *             structure (page shape gone — likely a block/redirect, not "0 TCG").
 */
export function classifyOutcome({ status = 0, challenged = false, rawCount = 0, confirmedEmpty = false } = {}) {
  if (status === 403 || status === 429) return 'block';
  if (challenged) return 'block';
  // A store's own confirmed "no results" signal is a normal outcome — checked AFTER
  // the real-block signals above so a genuine 403/challenge still wins, but BEFORE
  // the rawCount===0 fallback so a legit empty search doesn't count as a failure.
  if (confirmedEmpty) return 'success';
  if (!(rawCount > 0)) return 'block'; // found no products at all → page structure missing
  return 'success';
}

/**
 * Fold a per-store outcome into the persisted consecutive-failure counter.
 * @param {number} prevFailures the store's current consecutive_failures
 * @param {"block"|"success"|"transient"} outcome
 * @param {number} [threshold]
 * @returns {{ consecutiveFailures: number, disable: boolean }}
 *   - block   → increment; disable once the streak reaches the threshold.
 *   - success → reset to 0 (never disable).
 *   - transient (one-off network/nav error) → unchanged; NEVER disables on its own.
 */
export function applyFailureOutcome(prevFailures, outcome, threshold = BLOCK_DISABLE_THRESHOLD) {
  const prev = Number.isFinite(prevFailures) ? prevFailures : 0;
  if (outcome === 'success') return { consecutiveFailures: 0, disable: false };
  if (outcome === 'block') {
    const next = prev + 1;
    return { consecutiveFailures: next, disable: next >= threshold };
  }
  // transient: leave the streak untouched — a network blip neither disables a
  // store nor resets a genuine ongoing block streak.
  return { consecutiveFailures: prev, disable: false };
}
