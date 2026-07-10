import { next } from '@vercel/edge'

export const config = {
  matcher: ['/storybook', '/storybook/:path*'],
}

export default function middleware(request: Request) {
  const user = process.env.STORYBOOK_BASIC_AUTH_USER
  const pass = process.env.STORYBOOK_BASIC_AUTH_PASSWORD

  if (!user || !pass) {
    return new Response('Storybook Basic Auth is not configured', { status: 500 })
  }

  const authHeader = request.headers.get('authorization')

  if (authHeader?.startsWith('Basic ')) {
    const decoded = atob(authHeader.slice('Basic '.length))
    const separatorIndex = decoded.indexOf(':')
    const reqUser = decoded.slice(0, separatorIndex)
    const reqPass = decoded.slice(separatorIndex + 1)

    if (reqUser === user && reqPass === pass) {
      return next()
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Storybook", charset="UTF-8"' },
  })
}
