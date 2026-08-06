import { GAME_PAGES } from './gamePages'
import { SITE_ORIGIN } from './site'

/**
 * The sitemap, built from the same registry the routes are.
 *
 * NOT hand-written, and the game routes are not restated here: they come from
 * `GAME_PAGES`, so adding Magic once `magic-coverage` merges puts it in the
 * sitemap with no edit to this file. A static URL list is a claim about the
 * world that goes stale the first time a page is added, and the next page is
 * already queued.
 *
 * Rendered at BUILD time by the `sitemap` plugin in vite.config.ts, which emits
 * it as `dist/sitemap.xml`. It has to be a real file in the output directory
 * for the same reason `public/robots.txt` is one: Vercel serves static files
 * from the build output BEFORE applying the `vercel.json` rewrites, and the
 * catch-all `/((?!storybook).*) -> /index.html` would otherwise hand a crawler
 * the SPA shell with `content-type: text/html`. That is what `/robots.txt` did
 * before it was a real file, and it returned HTTP 200 while doing it.
 */

/**
 * Public routes that are not game pages.
 *
 * `/admin`, `/snipe` and `/login` are deliberately absent: robots.txt disallows
 * them and `useDocumentMeta` sends `noindex` on the operator routes. `/404` is
 * absent because it is not a page, it is a response.
 *
 * Kept in sync with `App.tsx` by an assertion in sitemap.node.test.ts rather
 * than by anyone remembering — adding a public route and forgetting the sitemap
 * is precisely how pages become orphans.
 */
export const STATIC_PUBLIC_PATHS = ['/', '/view', '/stores', '/privacy'] as const

/** Every path the sitemap declares, statics first, then the registry's. */
export function sitemapPaths(): string[] {
  return [...STATIC_PUBLIC_PATHS, ...GAME_PAGES.map((page) => page.path)]
}

/** Minimal XML escaping. No current path needs it; a future one with a query
 *  string or an ampersand would, and silently emitting invalid XML is worse
 *  than four lines of escaping. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * No `<changefreq>` or `<priority>`: Google ignores both, and they are two more
 * claims that go stale.
 *
 * No `<lastmod>` either, and that one is a judgement call. A build timestamp
 * would say "this page changed" on every deploy, including deploys that did not
 * touch it — and what actually changes on these pages is the product data,
 * which no build knows about. A `lastmod` that is wrong in both directions is
 * worse than none, and Google treats an untrustworthy one as noise.
 */
export function renderSitemap(origin: string = SITE_ORIGIN): string {
  const urls = sitemapPaths()
    .map((path) => `  <url>\n    <loc>${escapeXml(origin + path)}</loc>\n  </url>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}
