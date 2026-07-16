import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db/prisma'
import { authConfig } from '@/auth.config'
import { normalizeCpf, isValidCpf } from '@/lib/auth/cpf'
import { verifyPassword } from '@/lib/auth/password'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: 'CPF',
      credentials: {
        cpf: { label: 'CPF', type: 'text' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        const cpfRaw = String(credentials?.cpf ?? '')
        const password = String(credentials?.password ?? '')
        if (!isValidCpf(cpfRaw) || !password) return null
        const cpf = normalizeCpf(cpfRaw)
        const user = await prisma.user.findUnique({ where: { cpf } })
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
