import { next } from '@vercel/edge'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

function requireBasicAuth(request: Request, user: string | undefined, pass: string | undefined, realm: string) {
  if (!user || !pass) {
    return new Response(`${realm} Basic Auth is not configured`, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')

  if (authHeader?.startsWith('Basic ')) {
    const decoded = atob(authHeader.slice('Basic '.length))
    const separatorIndex = decoded.indexOf(':')
    const reqUser = decoded.slice(0, separatorIndex)
    const reqPass = decoded.slice(separatorIndex + 1)

    if (reqUser === user && reqPass === pass) {
      return null
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${realm}", charset="UTF-8"` },
  })
}

export default function middleware(request: Request) {
  const url = new URL(request.url)

  if (url.pathname === '/storybook' || url.pathname.startsWith('/storybook/')) {
    const denied = requireBasicAuth(
      request,
      process.env.STORYBOOK_BASIC_AUTH_USER,
      process.env.STORYBOOK_BASIC_AUTH_PASSWORD,
      'Storybook'
    )
    return denied ?? next()
  }

  if (process.env.APP_ENV === 'DEV') {
    // Dev serves a byte-identical copy of production at a different hostname, and
    // public/robots.txt — one file, shared by both — says `Allow: /`. The basic
    // auth below is therefore the ONLY thing keeping dev.packradar.info out of
    // Google. Removing it without this header would publish a full duplicate of
    // every indexable page, which is the same class of self-inflicted indexing
    // wound described at length in index.html.
    //
    // Sent unconditionally, not only when auth is off, so the protection cannot
    // be lost by flipping the flag below. A header costs nothing on a request
    // that was going to 401 anyway.
    const devHeaders = { 'x-robots-tag': 'noindex, nofollow' }

    // Explicit, greppable opt-out for debugging things that basic auth breaks —
    // service worker registration and the iOS install flow being the reason it
    // exists. Deliberately NOT "unset the credentials to disable it": that path
    // returns 500 from requireBasicAuth, and the fail-closed behaviour when
    // credentials are missing is a property worth keeping, since it means a
    // half-configured deploy is unreachable rather than silently public.
    if (process.env.DEV_DISABLE_BASIC_AUTH === '1') {
      return next({ headers: devHeaders })
    }

    const denied = requireBasicAuth(
      request,
      process.env.DEV_BASIC_AUTH_USER,
      process.env.DEV_BASIC_AUTH_PASSWORD,
      'Dev'
    )
    if (denied) {
      for (const [k, v] of Object.entries(devHeaders)) denied.headers.set(k, v)
      return denied
    }
    return next({ headers: devHeaders })
  }

  return next()
}
