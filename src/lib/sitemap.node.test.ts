import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sitemapPaths, renderSitemap, STATIC_PUBLIC_PATHS } from './sitemap'
import { GAME_PAGES } from './gamePages'
import { SITE_ORIGIN } from './site'

const readSrc = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

describe('sitemapPaths', () => {
  it('includes every registry route without restating one', () => {
    for (const page of GAME_PAGES) {
      expect(sitemapPaths()).toContain(page.path)
    }
  })

  it('includes the static public pages', () => {
    for (const path of STATIC_PUBLIC_PATHS) {
      expect(sitemapPaths()).toContain(path)
    }
  })

  // robots.txt disallows all three, and useDocumentMeta sends noindex on the
  // operator routes. Declaring them in the sitemap would contradict both.
  it.each(['/admin', '/snipe', '/login', '/404'])('excludes %s', (path) => {
    expect(sitemapPaths()).not.toContain(path)
  })

  it('has no duplicates', () => {
    const paths = sitemapPaths()
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('uses root-relative paths, so joining with the origin cannot double a slash', () => {
    for (const path of sitemapPaths()) {
      expect(path.startsWith('/')).toBe(true)
      expect(path.startsWith('//')).toBe(false)
    }
  })
})

/**
 * THE DRIFT GUARD. Everything above proves the sitemap agrees with itself; this
 * proves it agrees with the router. Adding a public route and forgetting the
 * sitemap is exactly how a page becomes an orphan, and it is invisible to every
 * other test in this repo.
 */
describe('sitemap against the router', () => {
  const app = readSrc('../App.tsx')
  const declaredPaths = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1])

  it('finds the routes it is checking against (guards against a silent regex miss)', () => {
    // If App.tsx is ever restructured so `path="…"` stops matching, every
    // assertion below would pass vacuously. This is the canary.
    expect(declaredPaths.length).toBeGreaterThanOrEqual(6)
    expect(declaredPaths).toContain('/view')
  })

  it('declares every static sitemap path as a route', () => {
    for (const path of STATIC_PUBLIC_PATHS) {
      expect(declaredPaths).toContain(path)
    }
  })

  it('leaves no public route out of the sitemap', () => {
    // Everything the router serves that is neither in the sitemap nor
    // deliberately excluded. Game routes are generated from the registry rather
    // than written as literals, so they never appear in this list.
    const excluded = new Set(['/login', '/admin', '/snipe', '*'])
    const missing = declaredPaths.filter(
      (path) => !excluded.has(path) && !sitemapPaths().includes(path),
    )

    expect(missing).toEqual([])
  })
})

describe('renderSitemap', () => {
  const xml = renderSitemap()

  it('emits one absolute loc per path', () => {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs).toEqual(sitemapPaths().map((path) => SITE_ORIGIN + path))
  })

  it('opens with the XML declaration a crawler expects', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true)
  })

  // Both are ignored by Google and both are claims that go stale. lastmod is
  // the interesting one: a build timestamp would mark every page as changed on
  // every deploy, while what actually changes here is product data no build
  // knows about.
  it.each(['<changefreq>', '<priority>', '<lastmod>'])('omits %s', (tag) => {
    expect(xml).not.toContain(tag)
  })

  it('escapes a path that would otherwise emit invalid XML', () => {
    expect(renderSitemap('https://example.test').includes('&amp;')).toBe(false)
    // The escaper itself, exercised through the public surface.
    expect(renderSitemap('https://example.test/?a=1&b=2')).toContain('&amp;b=2')
  })
})

describe('robots.txt', () => {
  const robots = readSrc('../../public/robots.txt')

  it('points at the sitemap on the canonical origin', () => {
    expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`)
  })

  // The note said "no Sitemap: line yet — the sitemap does not exist". It was
  // accurate when written and became false the moment the generator landed.
  // This repo's recurring defect is rationale that outlives its constraint, so
  // the removal is asserted rather than trusted.
  it('no longer claims the sitemap does not exist', () => {
    expect(robots).not.toMatch(/does not exist|no Sitemap: line yet/i)
  })

  it('still disallows every route the sitemap excludes', () => {
    for (const path of ['/admin', '/snipe', '/login', '/storybook']) {
      expect(robots).toContain(`Disallow: ${path}`)
    }
  })
})
