/* PackRadar service worker — push delivery only.
 *
 * ── This file has NO fetch handler, deliberately ─────────────────────────────
 * A service worker that caches would be actively harmful here. This is a Vite
 * SPA behind `/((?!storybook).*) -> /index.html` (vercel.json), so a cached
 * index.html pins the hashed bundle filenames it references. Get that wrong and
 * a visitor's phone serves a stale app FOREVER — self-healing requires the very
 * update mechanism the stale worker is breaking. For a site whose entire value
 * is "this listing is in stock RIGHT NOW", serving anything from cache is the
 * wrong default.
 *
 * The cost of that choice is real and accepted: with no fetch handler, Chrome
 * does not consider the site installable and will not fire `beforeinstallprompt`.
 * That is irrelevant on the platform this was built for first — iOS installs via
 * Share -> Add to Home Screen, which has never involved a service worker. Revisit
 * only when the Android path is being finished, and add a network-first handler
 * with an explicit version stamp if so. Do not add caching to make an install
 * banner appear.
 *
 * ── Served correctly despite the SPA catch-all ───────────────────────────────
 * Vercel serves static files from the output directory BEFORE applying
 * vercel.json rewrites, so /sw.js resolves to this file rather than the SPA
 * shell. Same mechanism that makes /robots.txt and /sitemap.xml work — see the
 * sitemapPlugin comment in vite.config.ts. A worker served as text/html fails
 * registration with a MIME type error.
 */

/* Take over immediately instead of waiting for every tab to close.
 *
 * On iOS this is not a nicety. The home-screen app is usually a SINGLE
 * long-lived task that the OS suspends and resumes rather than closes, so an
 * updated worker can sit in `waiting` for days. Push then keeps being handled by
 * the old worker, and a payload-shape change silently stops rendering. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/* The number the payload carries so the worker does not have to trust its own
 * arithmetic on a malformed message. Kept in one place because the fallback path
 * below has to produce something sane without it. */
const FALLBACK_TITLE = 'PackRadar';
const FALLBACK_BODY = 'Un produs urmărit este din nou în stoc.';

self.addEventListener('push', (event) => {
  /* ── iOS: a push MUST result in a visible notification ─────────────────────
   * Safari treats a push that resolves without calling showNotification() as an
   * abuse of the channel. Do it repeatedly and the OS revokes push permission
   * for the web app — silently, with no way to re-request, because permission is
   * one-shot. So EVERY path through this handler ends in a notification,
   * including the ones where the payload is missing or unparseable. A wrong
   * notification is recoverable; a revoked permission is not.
   *
   * This is also why there is no "silent update" branch here and why the whole
   * body sits inside waitUntil: returning before showNotification() settles is
   * the same failure as never calling it. */
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch {
    /* Malformed or non-JSON payload. Fall through to the generic notification
     * rather than returning — see above. */
  }

  const title = typeof data.title === 'string' && data.title ? data.title : FALLBACK_TITLE;
  const body = typeof data.body === 'string' && data.body ? data.body : FALLBACK_BODY;
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/view';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      /* Collapses consecutive alerts into one entry instead of stacking a
       * separate banner per restock. A sweep that finds eight products should
       * buzz the phone once. */
      tag: typeof data.tag === 'string' && data.tag ? data.tag : 'packradar-stock',
      renotify: true,
      /* Where notificationclick sends them. `url` is validated above as a
       * same-origin path — a payload must never be able to name an arbitrary
       * destination, since the push service is not an authenticated source. */
      data: { url },
    }),
  );
});

/* Where a tapped notification's destination is parked so the app can pick it up
 * even when the tap itself fails to carry it.
 *
 * Both halves of this contract are duplicated in usePushNavigation.ts — a
 * service worker in public/ cannot import from src/. Keep the two in step; the
 * failure mode if they drift is silent (the filter simply never applies).
 *
 * The Cache API rather than a module-level variable because iOS is free to kill
 * and restart the worker between the tap and the app finishing its boot, which
 * would take any in-memory value with it. */
const NAV_CACHE = 'packradar-pending-nav';
const NAV_KEY = '/__packradar_pending_nav';

async function stashPendingNav(url) {
  try {
    const cache = await caches.open(NAV_CACHE);
    await cache.put(
      NAV_KEY,
      new Response(JSON.stringify({ url, at: Date.now() }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
  } catch {
    /* Storage unavailable. The postMessage and openWindow paths below still
     * run; this is the belt, not the only strap. */
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/view';

  event.waitUntil(
    (async () => {
      /* Park the destination FIRST, before anything that might not deliver it.
       *
       * Neither of the two ways to hand a URL to an installed iOS app is
       * reliable. openWindow() commonly launches the app at its start_url and
       * silently discards the deep link, and postMessage needs the page's
       * listener to already be mounted — which it is not during a cold boot.
       * Observed directly: a tapped Pokemon alert opened /view unfiltered.
       *
       * So the URL is written somewhere the app can come and fetch it once it is
       * ready, and the two mechanisms below become optimisations rather than
       * requirements. */
      await stashPendingNav(target);

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          /* Fast path for an app that is already running: it navigates without
           * waiting for a visibilitychange. Harmless if it arrives after the
           * page has already consumed the parked value — the destination is the
           * same, and navigating twice to one URL is a no-op. */
          client.postMessage({ type: 'packradar:navigate', url: target });
          return;
        }
      }

      /* Nothing open: cold start. The URL is passed anyway for the platforms
       * that honour it, and the parked copy covers the ones that do not. */
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});
