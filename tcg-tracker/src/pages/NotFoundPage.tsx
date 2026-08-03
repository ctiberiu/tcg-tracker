import { Link } from 'react-router-dom'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { NavBar, PackRadarFooter, MobileTabBar } from '../components/packradar'

/**
 * 404.
 *
 * Replaces `*` -> <Navigate to="/login" />. That redirect made every non-existent
 * URL render the login page: unlimited distinct URLs serving one duplicate body,
 * which is a soft-404 pattern that harms crawling rather than merely failing to help.
 *
 * Reuses the product's own vocabulary instead of inventing error language — NO SIGNAL
 * is already STORE_STATUS_LABEL.DOWN in tokens.ts, shown when a shop goes dark. A page
 * that isn't there is just another thing the sweep didn't find. The red is the existing
 * GONE status colour, so nothing new enters the palette.
 *
 * ONE action, deliberately: NavBar above already links everywhere, so a row of buttons
 * duplicates navigation one row up. /view is the recovery that matters — whoever hit a
 * dead URL wanted a product, and that's the page with search and filters.
 *
 * ⚠️ This fixes what a PERSON sees, not what a CRAWLER sees. The page still returns
 * HTTP 200 because vercel.json rewrites every path to index.html. Real 404 status codes
 * need that catch-all narrowed to known routes — folded into epic 8d2bc57c, where the
 * route list is GENERATED. A hand-maintained route list is exactly the kind of claim
 * that goes stale the first time someone adds a page.
 */
export function NotFoundPage() {
  useDocumentMeta({
    title: 'Page not found | PackRadar',
    description: 'That page is not on the radar. Search every tracked Romanian TCG restock instead.',
    path: '/404',
    // Belt and braces: even once real status codes land, never index a 404 body.
    noindex: true,
  })

  return (
    <div className="packradar pr-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <NavBar active="landing" />

      <div className="pr-404">
        <div style={{ minWidth: 0 }}>
          <div className="pr-404__eyebrow">
            <span className="pr-404__dot" />
            NO SIGNAL
          </div>

          <div className="pr-404__code">404</div>

          <div className="pr-404__lede">This page isn&rsquo;t on the radar.</div>

          <div className="pr-404__sub">
            The address you followed doesn&rsquo;t match anything we track. It may have been moved,
            or it may never have existed. The sweep is still running everywhere else.
          </div>

          <Link to="/view" className="pr-404__cta">
            OPEN SIGNAL LOG &rarr;
          </Link>
        </div>

        {/* Decorative. aria-hidden: it restates the copy rather than adding to it, and the
            sweep would otherwise be announced as meaningless structure. */}
        <div className="pr-404__scope" aria-hidden="true">
          <div className="pr-404__sweep" />
          <div className="pr-404__cross-h" />
          <div className="pr-404__cross-v" />
          <div className="pr-404__ring pr-404__ring--1" />
          <div className="pr-404__ring pr-404__ring--2" />
          <div className="pr-404__ring pr-404__ring--3" />
          <div className="pr-404__ring pr-404__ring--4" />
          <div className="pr-404__scope-label">
            <strong>NO CONTACT</strong>
            0 RESULTS
          </div>
        </div>
      </div>

      <PackRadarFooter />
      <MobileTabBar active="landing" />
    </div>
  )
}
