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
    const denied = requireBasicAuth(
      request,
      process.env.DEV_BASIC_AUTH_USER,
      process.env.DEV_BASIC_AUTH_PASSWORD,
      'Dev'
    )
    return denied ?? next()
  }

  return next()
}
