import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import type { AccountRole, PrismaClient } from '@prisma/client'
import { hasMinRole } from '@/lib/auth/roles'

export class AccountAuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export type AccountContext = {
  userId: string
  accountId: string
  role: AccountRole
  account: {
    id: string
    name: string
    default_currency: string
    owner_user_id: string
  }
  /** @deprecated use prisma */
  supabase: PrismaClient
  prisma: PrismaClient
}

export async function getCurrentAccount(): Promise<AccountContext> {
  const session = await auth()
  if (!session?.user?.id) {
    throw new AccountAuthError('Unauthorized', 401)
  }
  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    include: { account: true },
  })
  if (!profile) {
    throw new AccountAuthError('Profile not found', 404)
  }
  return {
    userId: session.user.id,
    accountId: profile.accountId,
    role: profile.accountRole,
    account: {
      id: profile.account.id,
      name: profile.account.name,
      default_currency: profile.account.defaultCurrency,
      owner_user_id: profile.account.ownerUserId,
    },
    supabase: prisma,
    prisma,
  }
}

export async function requireRole(min: AccountRole): Promise<AccountContext> {
  const ctx = await getCurrentAccount()
  if (!hasMinRole(ctx.role, min)) {
    throw new AccountAuthError('Forbidden', 403)
  }
  return ctx
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof AccountAuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  if (err instanceof Response) {
    return err as unknown as NextResponse
  }
  console.error('[account]', err)
  return NextResponse.json({ error: 'Internal error' }, { status: 500 })
}

export async function setMemberRole(
  accountId: string,
  userId: string,
  role: AccountRole
) {
  if (role === 'owner') throw new Error('Cannot assign owner via setMemberRole')
  await prisma.profile.updateMany({
    where: { accountId, userId },
    data: { accountRole: role },
  })
}

export async function removeAccountMember(accountId: string, userId: string) {
  await prisma.profile.deleteMany({
    where: { accountId, userId, accountRole: { not: 'owner' } },
  })
}

export async function transferAccountOwnership(
  accountId: string,
  newOwnerUserId: string
) {
  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: accountId } })
    await tx.profile.updateMany({
      where: { accountId, userId: tenant.ownerUserId },
      data: { accountRole: 'admin' },
    })
    await tx.profile.updateMany({
      where: { accountId, userId: newOwnerUserId },
      data: { accountRole: 'owner' },
    })
    await tx.tenant.update({
      where: { id: accountId },
      data: { ownerUserId: newOwnerUserId },
    })
  })
}

export class UnauthorizedError extends AccountAuthError {
  constructor(message = "Unauthorized") { super(message, 401) }
}
export class ForbiddenError extends AccountAuthError {
  constructor(message = "Forbidden") { super(message, 403) }
}
