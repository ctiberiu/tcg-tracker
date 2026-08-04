/**
 * The canonical origin, in one place.
 *
 * It was previously a private constant inside `useDocumentMeta`. The sitemap
 * needs the same value, and a sitemap whose URLs disagree with the pages' own
 * `<link rel="canonical">` sends Google two different answers to "which URL is
 * this page". Two copies of a hostname is exactly the shape of drift this repo
 * keeps paying for, so there is one.
 *
 * Why a literal and not `window.location.origin`: the app is served on BOTH
 * packradar.info and the auto-assigned tcg-tracker-kappa.vercel.app with
 * byte-identical HTML, and the whole point of the canonical is to name the
 * winner regardless of which host was crawled. It also has to work at build
 * time, where there is no window.
 */
export const SITE_ORIGIN = 'https://packradar.info'
