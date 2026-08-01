/**
 * Request filtering for scraped shop pages.
 *
 * ── What this does, and what it explicitly does NOT claim ────────────────────
 * Blocks `image`, `media` and `font`. Nothing else.
 *
 * It buys bandwidth and fewer third-party network connections. **It claims no
 * hostile-JS protection**, and that wording is deliberate: passive assets do not
 * execute, so blocking them protects against nothing that runs. The resource
 * type carrying execution risk is `script`, and blocking cross-origin scripts is
 * a different control with a different cost — it needs a per-store allowlist,
 * because shops serve their own rendering code from platform domains
 * (scraper.js documents pokemania.ro as a "distinct cdnmp.net platform").
 *
 * **Do not "finish the job" by adding `script` to the blocked list.** It would
 * break client-rendered shops in the way described below, and the security it
 * appears to buy is exactly the part that needs the allowlist to be safe.
 *
 * An origin-aware mode was written and then deliberately REMOVED before merge.
 * It was unverified, off by default, and served a tier that is gated and
 * unscheduled — a mechanism whose safety gate lived somewhere else, sitting
 * where someone would reach for it. If cross-origin blocking is ever scheduled,
 * it should be written then, against the code as it is then.
 *
 * ── The risk this code carries runs the other way ────────────────────────────
 * Over-blocking is far likelier than any attack, and it fails nastily. Commit
 * 9bf84aa made scrapeAtuToys return `[]`; classifyOutcome reads empty as a
 * block; 17 strikes later the store auto-disabled while its page served 15
 * products the whole time. Anything that stops a shop rendering reproduces that
 * exactly — silently, and 12 hours after the change lands.
 */

/**
 * Types that cannot affect what we extract.
 *
 * Image URLs are read from the DOM `src`/`data-src` attribute, never from the
 * decoded bitmap, so aborting the request leaves the attribute — and therefore
 * `image_url` — intact. Verified across all 67 enabled stores: non-null
 * `image_url` counts were identical before and after.
 */
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'font', 'media']);

/**
 * Types allowed unconditionally. Checked BEFORE anything else.
 *
 * `document`   — filtering the navigation itself would make a store read as a
 *                hard failure rather than a filtered one.
 * `stylesheet` — THE SUBTLE ONE. Playwright's waitForSelector defaults to
 *                state:'visible', and all 16 calls in scraper.js rely on that
 *                default, so visibility is computed from CSS. Block stylesheets
 *                and an element the site's CSS reveals never becomes visible →
 *                waitForSelector times out → the swallow-catch returns [] →
 *                classifyOutcome reads empty as a block → 5 strikes → flagged →
 *                12h → auto-disabled, on a store serving product throughout.
 *                Do not add `stylesheet` here for the bandwidth. The bandwidth
 *                is not worth a store switching itself off overnight.
 */
const ALWAYS_ALLOWED_RESOURCE_TYPES = new Set(['document', 'stylesheet']);

/**
 * Decide whether a request should be allowed.
 *
 * Origin-independent by design — see the note above on the removed mode. The
 * store URL is accepted but unused, kept in the signature so the call site reads
 * as a policy decision about a specific store rather than a global switch.
 *
 * @returns {{ allow: boolean, reason: string }} reason is for logging — being
 *   able to see what this did is most of its value.
 */
export function shouldAllowRequest(_storeUrl, _requestUrl, resourceType) {
  if (ALWAYS_ALLOWED_RESOURCE_TYPES.has(resourceType)) {
    return { allow: true, reason: `always-allowed:${resourceType}` };
  }
  if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
    return { allow: false, reason: `resource-type:${resourceType}` };
  }
  return { allow: true, reason: 'not-a-blocked-type' };
}
