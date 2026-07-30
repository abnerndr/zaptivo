import type { NextAuthConfig } from 'next-auth'

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
        pathname.startsWith('/api/whatsapp/webhook') ||
        // Public invite peek (no auth) — redeem still requires session
        (pathname.startsWith('/api/invitations/') && pathname.endsWith('/peek')) ||
        pathname === '/'

      if (isPublic) {
        if (
          isLoggedIn &&
          (pathname === '/login' || pathname === '/signup' || pathname === '/forgot-password')
        ) {
          const invite = request.nextUrl.searchParams.get('invite')
          if (invite && (pathname === '/login' || pathname === '/signup')) {
            return Response.redirect(new URL(`/join/${encodeURIComponent(invite)}`, request.nextUrl))
          }
          return Response.redirect(new URL('/dashboard', request.nextUrl))
        }
        return true
      }

      if (!isLoggedIn) {
        const login = new URL('/login', request.nextUrl)
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
