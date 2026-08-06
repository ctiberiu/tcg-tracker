import { useEffect } from 'react'
// Shared with the sitemap generator. A sitemap whose URLs disagree with these
// canonicals would give Google two answers to the same question — see site.ts.
import { SITE_ORIGIN } from '../lib/site'

interface DocumentMeta {
  title: string
  description: string
  /** Path only, e.g. '/view'. Combined with SITE_ORIGIN to build the canonical. */
  path: string
  /** Set true on operator-only routes so they can't be indexed even if linked. */
  noindex?: boolean
}

function setMeta(selector: string, attr: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    const [, name, key] = selector.match(/\[(name|property)="([^"]+)"\]/) ?? []
    if (name && key) el.setAttribute(name, key)
    document.head.appendChild(el)
  }
  el.setAttribute(attr, value)
}

/**
 * Per-route <title>, description and canonical.
 *
 * Before this existed, every route served the SAME title and description from
 * index.html — identical <title>, identical <meta description>, and (to a
 * crawler that doesn't run JS) an identical 186-character body. Identical title
 * + description + body across distinct URLs is a duplicate cluster, and the
 * usual outcome is Google canonicalising them down to one page.
 *
 * The canonical matters for a second, separate reason: the app is served on
 * BOTH packradar.info and the auto-assigned tcg-tracker-kappa.vercel.app with
 * byte-identical HTML (verified — same md5). Pinning the canonical to
 * SITE_ORIGIN tells Google which hostname owns the content regardless of which
 * one it crawled.
 *
 * NOTE this runs client-side, so it only helps crawlers that execute JS (Google
 * does; most others don't). It is the cheap fix, NOT a substitute for
 * prerendering — see epic 8d2bc57c.
 */
export function useDocumentMeta({ title, description, path, noindex }: DocumentMeta) {
  useEffect(() => {
    document.title = title

    setMeta('meta[name="description"]', 'content', description)
    setMeta('meta[property="og:title"]', 'content', title)
    setMeta('meta[property="og:description"]', 'content', description)
    setMeta('meta[name="twitter:title"]', 'content', title)
    setMeta('meta[name="twitter:description"]', 'content', description)
    setMeta('meta[property="og:url"]', 'content', SITE_ORIGIN + path)

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!link) {
      link = document.createElement('link')
      link.setAttribute('rel', 'canonical')
      document.head.appendChild(link)
    }
    link.setAttribute('href', SITE_ORIGIN + path)

    // Operator routes: remove on unmount rather than leaving a stale noindex
    // behind when navigating from /admin to a public page.
    const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (noindex) {
      setMeta('meta[name="robots"]', 'content', 'noindex, nofollow')
    } else if (robots) {
      robots.remove()
    }
  }, [title, description, path, noindex])
}
