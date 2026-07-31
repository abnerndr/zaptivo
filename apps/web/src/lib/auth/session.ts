import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import type { AccountRole } from '@prisma/client'

const ROLE_RANK: Record<AccountRole, number> = {
  viewer: 0,
  agent: 1,
  admin: 2,
  owner: 3,
}

export async function requireSession() {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Response('Unauthorized', { status: 401 })
  }
  return session
}

export async function requireAccountMember(
  accountId: string,
  minRole: AccountRole = 'viewer'
) {
  const session = await requireSession()
  const profile = await prisma.profile.findFirst({
    where: { userId: session.user.id, accountId },
  })
  if (!profile) {
    throw new Response('Forbidden', { status: 403 })
  }
  if (ROLE_RANK[profile.accountRole] < ROLE_RANK[minRole]) {
    throw new Response('Forbidden', { status: 403 })
  }
  return { session, profile }
}

export async function getSessionProfile() {
  const session = await auth()
  if (!session?.user?.id) return null
  return prisma.profile.findUnique({
    where: { userId: session.user.id },
    include: { account: true },
  })
}
