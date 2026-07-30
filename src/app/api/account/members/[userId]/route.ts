import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  removeAccountMember,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import type { AccountRole } from '@/lib/auth/roles'
import { ACCOUNT_ROLES, isAccountRole } from '@/lib/auth/roles'
import { prisma } from '@/lib/db/prisma'
import { ensureSystemOrgRoles } from '@/lib/auth/org-roles'

type Ctx = { params: Promise<{ userId: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { userId } = await ctx.params
    const account = await requireRole('admin')
    const body = (await req.json().catch(() => ({}))) as {
      role?: string
      orgRoleId?: string
      fullName?: string
      email?: string
    }

    if (userId === account.userId && body.role) {
      return NextResponse.json(
        { error: 'Não é possível alterar o próprio cargo' },
        { status: 400 },
      )
    }

    const target = await prisma.profile.findFirst({
      where: { accountId: account.accountId, userId },
      include: { user: true },
    })
    if (!target) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
    }
    if (target.accountRole === 'owner') {
      return NextResponse.json(
        { error: 'Não é possível editar o proprietário por aqui' },
        { status: 400 },
      )
    }

    await ensureSystemOrgRoles(account.accountId)

    let nextRole: AccountRole | undefined
    let nextOrgRoleId: string | null | undefined

    if (body.orgRoleId) {
      const orgRole = await prisma.orgRole.findFirst({
        where: { id: body.orgRoleId, accountId: account.accountId },
      })
      if (!orgRole) {
        return NextResponse.json({ error: 'Cargo inválido' }, { status: 400 })
      }
      if (orgRole.systemKey === 'owner') {
        return NextResponse.json(
          { error: 'Não é possível atribuir proprietário por aqui' },
          { status: 400 },
        )
      }
      nextOrgRoleId = orgRole.id
      nextRole =
        orgRole.systemKey && isAccountRole(orgRole.systemKey)
          ? orgRole.systemKey
          : 'agent'
    } else if (body.role) {
      const role = body.role as AccountRole
      if (!ACCOUNT_ROLES.includes(role) || role === 'owner') {
        return NextResponse.json(
          { error: 'Cargo inválido' },
          { status: 400 },
        )
      }
      nextRole = role
      const systemRole = await prisma.orgRole.findFirst({
        where: { accountId: account.accountId, systemKey: role },
      })
      nextOrgRoleId = systemRole?.id ?? null
    }

    const fullName = body.fullName?.trim()
    const email = body.email?.trim().toLowerCase()

    if (email) {
      const emailTaken = await prisma.user.findFirst({
        where: { email, id: { not: userId } },
      })
      if (emailTaken) {
        return NextResponse.json(
          { error: 'E-mail já está em uso' },
          { status: 400 },
        )
      }
    }

    await prisma.$transaction(async (tx) => {
      if (nextRole) {
        await tx.profile.updateMany({
          where: { accountId: account.accountId, userId },
          data: {
            accountRole: nextRole,
            ...(nextOrgRoleId !== undefined ? { orgRoleId: nextOrgRoleId } : {}),
          },
        })
      } else if (nextOrgRoleId !== undefined) {
        await tx.profile.updateMany({
          where: { accountId: account.accountId, userId },
          data: { orgRoleId: nextOrgRoleId },
        })
      }

      if (fullName || email) {
        await tx.profile.updateMany({
          where: { accountId: account.accountId, userId },
          data: {
            ...(fullName ? { fullName } : {}),
            ...(email ? { email } : {}),
          },
        })
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(fullName ? { name: fullName } : {}),
            ...(email ? { email } : {}),
          },
        })
      }
    })

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
        { error: 'Não é possível remover a si mesmo' },
        { status: 400 },
      )
    }

    const target = await prisma.profile.findFirst({
      where: { accountId: account.accountId, userId },
    })
    if (!target) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
    }
    if (target.accountRole === 'owner') {
      return NextResponse.json(
        { error: 'Não é possível remover o proprietário' },
        { status: 400 },
      )
    }

    await removeAccountMember(account.accountId, userId)
    await getCurrentAccount()
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
