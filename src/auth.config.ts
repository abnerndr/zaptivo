import type { NextAuthConfig } from 'next-auth'
import {
  applyLocalAuthGuard,
  localAuthRedirectBase,
} from '@/domain/auth/local-origin'

applyLocalAuthGuard(process.env)

function redirectBase(request: {
  nextUrl: URL
  headers: { get(name: string): string | null }
}): string {
  return localAuthRedirectBase({
    nodeEnv: process.env.NODE_ENV,
    nextOrigin: request.nextUrl.origin,
    headers: request.headers,
  })
}

export const authConfig = {
  // Dokploy/Traefik: Host vem do proxy (ou 0.0.0.0 no container).
  // Sem isto → UntrustedHost → /api/auth/error "server configuration".
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  // Credentials provider requires JWT sessions (Auth.js constraint).
  // Users still live in Prisma; Session table reserved for future OAuth.
  session: { strategy: 'jwt' },
  ...(process.env.AUTH_COOKIE_DOMAIN
    ? {
        cookies: {
          sessionToken: {
            name:
              process.env.NODE_ENV === 'production'
                ? '__Secure-authjs.session-token'
                : 'authjs.session-token',
            options: {
              httpOnly: true,
              sameSite: 'lax' as const,
              path: '/',
              secure: process.env.NODE_ENV === 'production',
              domain: process.env.AUTH_COOKIE_DOMAIN,
            },
          },
        },
      }
    : {}),
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl
      const isLoggedIn = !!auth?.user

      const isPublic =
        pathname.startsWith('/login') ||
        pathname.startsWith('/signup') ||
        pathname.startsWith('/forgot-password') ||
        pathname.startsWith('/join') ||
        pathname.startsWith('/api/auth') ||
        pathname === '/'

      if (isPublic) {
        if (
          isLoggedIn &&
          (pathname === '/login' || pathname === '/signup' || pathname === '/forgot-password')
        ) {
          const invite = request.nextUrl.searchParams.get('invite')
          const base = redirectBase(request)
          if (invite && (pathname === '/login' || pathname === '/signup')) {
            return Response.redirect(new URL(`/join/${encodeURIComponent(invite)}`, base))
          }
          return Response.redirect(new URL('/dashboard', base))
        }
        return true
      }

      if (!isLoggedIn) {
        const login = new URL('/login', redirectBase(request))
        login.searchParams.set('callbackUrl', pathname)
        return Response.redirect(login)
      }
      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id
      }
      return token
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
      }
      return session
    },
  },
} satisfies NextAuthConfig
