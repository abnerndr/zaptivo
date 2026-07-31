import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db/prisma'
import { authConfig } from '@/auth.config'
import { normalizeCpf, isValidCpf } from '@/lib/auth/cpf'
import { verifyPassword } from '@/lib/auth/password'

function looksLikeCpf(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 11 && /^\d[\d.\-\s]*$/.test(raw.trim())
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        identifier: { label: 'E-mail ou CPF', type: 'text' },
        // Keep `cpf` for backwards compatibility with older clients
        cpf: { label: 'CPF', type: 'text' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        const password = String(credentials?.password ?? '')
        const raw = String(
          credentials?.identifier ?? credentials?.cpf ?? '',
        ).trim()
        if (!raw || !password) return null

        let user =
          looksLikeCpf(raw) && isValidCpf(raw)
            ? await prisma.user.findUnique({
                where: { cpf: normalizeCpf(raw) },
              })
            : null

        if (!user && raw.includes('@')) {
          user = await prisma.user.findUnique({
            where: { email: raw.toLowerCase() },
          })
        }

        // Fallback: try CPF normalize even if looksLikeCpf was loose
        if (!user) {
          const digits = raw.replace(/\D/g, '')
          if (digits.length === 11 && isValidCpf(digits)) {
            user = await prisma.user.findUnique({
              where: { cpf: digits },
            })
          }
        }

        if (!user?.passwordHash) return null
        const ok = await verifyPassword(password, user.passwordHash)
        if (!ok) return null
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        }
      },
    }),
  ],
})
