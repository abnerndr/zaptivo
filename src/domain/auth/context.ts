import { auth } from '@/auth'
import { prisma } from '@/domain/db/prisma'
import type { AccountRole, Profile, Tenant } from '@prisma/client'

export type SessionAccount = {
  userId: string
  accountId: string
  role: AccountRole
  profile: Profile & { account: Tenant }
}

export async function getSessionAccount(): Promise<SessionAccount | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    include: { account: true },
  })
  if (!profile) return null
  return {
    userId: session.user.id,
    accountId: profile.accountId,
    role: profile.accountRole,
    profile,
  }
}

export async function requireSessionAccount(): Promise<SessionAccount> {
  const ctx = await getSessionAccount()
  if (!ctx) throw new Response('Unauthorized', { status: 401 })
  return ctx
}
