import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  removeAccountMember,
  requireRole,
  setMemberRole,
  toErrorResponse,
} from '@/lib/auth/account'
import type { AccountRole } from '@/lib/auth/roles'
import { ACCOUNT_ROLES } from '@/lib/auth/roles'
import { prisma } from '@/lib/db/prisma'

type Ctx = { params: Promise<{ userId: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { userId } = await ctx.params
    const account = await requireRole('admin')
    const body = (await req.json().catch(() => ({}))) as { role?: string }
    const role = body.role as AccountRole | undefined

    if (!role || !ACCOUNT_ROLES.includes(role) || role === 'owner') {
      return NextResponse.json(
        { error: 'Invalid role (owner cannot be assigned here)' },
        { status: 400 },
      )
    }

    if (userId === account.userId) {
      return NextResponse.json(
        { error: 'Cannot change your own role' },
        { status: 400 },
      )
    }

    const target = await prisma.profile.findFirst({
      where: { accountId: account.accountId, userId },
    })
    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }
    if (target.accountRole === 'owner') {
      return NextResponse.json(
        { error: 'Cannot change the owner role here' },
        { status: 400 },
      )
    }

    await setMemberRole(account.accountId, userId, role)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { userId } = await ctx.params
    const account = await requireRole('admin')

    if (userId === account.userId) {
      return NextResponse.json(
        { error: 'Cannot remove yourself' },
        { status: 400 },
      )
    }

    const target = await prisma.profile.findFirst({
      where: { accountId: account.accountId, userId },
    })
    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }
    if (target.accountRole === 'owner') {
      return NextResponse.json(
        { error: 'Cannot remove the account owner' },
        { status: 400 },
      )
    }

    await removeAccountMember(account.accountId, userId)
    // Ensure caller still has a valid session context
    await getCurrentAccount()
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
