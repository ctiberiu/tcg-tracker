# Bake per-route title, description and canonical into the HTML at build time

> Drafted 2026-08-12 by Epic Manager. Not yet a DevChain epic — the MCP
> connection was down. Create it on the board and delete this file.

## Evidence first, because this reopens a closed decision

Google began collecting impressions for packradar.info on **2026-08-10**, four
days after the hardcoded canonical was removed on 08-06. That fix worked. But
of the URLs Search Console reports, **3 are indexed and 3 are not**, and the
reason is measurable:

    RAW HTML (the crawl pass), all 9 URLs identical:
      <title>        PackRadar — Always scanning
      <description>  Every Romanian TCG store, swept on a constant cycle…

    AFTER JS (the render pass):
      <title>        Cărți Pokémon în România: ce este în stoc acum | PackRadar

`useDocumentMeta` runs client-side. **Crawling and rendering are separate
queued passes**, so at crawl time Google sees nine documents with the same
title, the same description and a near-identical body. That is a duplicate
cluster — a weaker version of the canonical bug, same shape.

Google does render this site; the live test confirmed it. But rendering
*promptly* is a different claim from rendering *at all*, and the render queue
is deprioritised for new low-authority domains. 3 rendered and indexed, 3 still
queued, fits exactly.

## This reverses a call in epic `8d2bc57c`

That epic dropped prerendering on the reasoning "Search Console says rendering
works, so we do not need it." The Coder argued at the time that a new domain's
render queue is often deprioritised and *"Crawled – currently not indexed"* is
the common outcome for thin-shell SPAs, and that the check should not settle
it. **They were right, and the 3-of-6 split is the evidence.** The point is not
who was right: it is that "it renders" was never the same question as "it gets
indexed".

## What to build — the head only, not SSR

Emit a **static HTML file per route at build time**, each carrying its own
`<title>`, `<meta name="description">`, `<meta property="og:*">` and
`<link rel="canonical">`. The SPA hydrates the body exactly as now.

**No server runtime, no framework migration, no React SSR.** The pieces exist:

- `src/lib/gamePages.ts` — `GAME_PAGES`, already the source of truth for routes,
  sitemap entries and internal links
- `src/lib/sitemap.ts` + the `packradar-sitemap` Vite plugin in `vite.config.ts`
  — already walks that registry at build time and emits via `emitFile`
- `useDocumentMeta` — already holds the per-route strings for non-game pages

The same plugin can emit `carti-pokemon.html`, `view.html` and so on. **Adding a
game must stay a one-entry change** — that property has held through three
epics and must not break here.

## Where the strings live — decide deliberately

Game routes have their metadata in `GAME_PAGES`. `/`, `/view`, `/stores` and
`/privacy` have theirs inline in each page's `useDocumentMeta` call. Baking them
at build time needs them reachable from the build: either lift them into a
shared registry, or duplicate them.

**Do not duplicate.** A second copy of a title that drifts from the one the SPA
sets is this project's recurring defect, and here it would be invisible: the
crawler sees one string and every human sees the other. One source, consumed by
both build and runtime.

## The serving constraint that has bitten twice

`vercel.json` rewrites `/((?!storybook).*)` to `/index.html`. A real file in the
build output escapes that — which is why `robots.txt` and `sitemap.xml` work.
**Verify by fetching the deployed URL and checking the served `<title>`, not by
checking the file exists in `dist/`.** `/sitemap.xml` returned HTTP 200 with
`text/html` for weeks while looking fine.

Vercel may need `cleanUrls` or explicit routing so `/carti-pokemon` serves
`carti-pokemon.html` rather than the SPA shell. Establish that before declaring
it done.

## Scope
- IN: per-route title, description, og tags and canonical in the initial HTML
  for all 9 routes, verified on the deployed URL.
- OUT: SSR of the body, RSC, framework migration. The body can stay
  client-rendered; it is the head that decides the duplicate question.
- OUT: structured data — separate, affects click-through not indexing.

## DoD
- [ ] `curl` on each deployed route returns that route's own title and
      description, with no JavaScript executed.
- [ ] All 9 canonicals are self-referential in the raw HTML.
- [ ] No title or description exists in two places; one source feeds both.
- [ ] Adding a game page is still a single `GAME_PAGES` entry — prove it with a
      throwaway entry, build, grep, revert.
- [ ] The SPA still hydrates on every route; no double-render of the head, no
      flash of the wrong title.
- [ ] Verified on the deployed URL, checking served content not `dist/`.
- [ ] `npm test` / `npm run build` pass; no new lint problems in changed files.
- [ ] Branch from `develop`.

## After it ships
Watch whether the 3 unindexed URLs move. If they settle on *"Discovered –
currently not indexed"* rather than *"Crawled"*, the problem is authority rather
than rendering, and this was not the fix.

Same family as `3c1dfea2` and the `SIGNAL_ROW_CAP` truncation: something that
reads as working while quietly doing nothing.
