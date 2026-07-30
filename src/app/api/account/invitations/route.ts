import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { prisma } from '@/lib/db/prisma'
import {
  clampExpiryDays,
  generateInviteToken,
  inviteExpiresAt,
  inviteUrl,
} from '@/lib/auth/invitations'
import { ensureSystemOrgRoles } from '@/lib/auth/org-roles'
import { sendInviteEmail } from '@/lib/email/sendgrid'
import type { AccountRole } from '@/lib/auth/roles'
import { isAccountRole } from '@/lib/auth/roles'

export async function GET() {
  try {
    const ctx = await requireRole('admin')
    const rows = await prisma.accountInvitation.findMany({
      where: {
        accountId: ctx.accountId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        orgRole: { select: { id: true, name: true, systemKey: true } },
      },
    })

    const invitations = rows
      .filter((r) => r.role !== 'owner')
      .map((r) => ({
        id: r.id,
        role: r.role as 'admin' | 'agent' | 'viewer',
        org_role_id: r.orgRoleId,
        org_role_name: r.orgRole?.name ?? null,
        email: r.email,
        label: r.label,
        created_at: r.createdAt.toISOString(),
        expires_at: r.expiresAt.toISOString(),
      }))

    return NextResponse.json({ invitations })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const body = (await request.json().catch(() => ({}))) as {
      role?: AccountRole
      orgRoleId?: string
      email?: string
      label?: string
      expiresInDays?: number
    }

    const email = body.email?.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'E-mail do convidado é obrigatório' },
        { status: 400 },
      )
    }

    await ensureSystemOrgRoles(ctx.accountId)

    let role: AccountRole = 'agent'
    let orgRoleId: string | null = null
    let roleLabel = 'Agente'

    if (body.orgRoleId) {
      const orgRole = await prisma.orgRole.findFirst({
        where: { id: body.orgRoleId, accountId: ctx.accountId },
      })
      if (!orgRole) {
        return NextResponse.json({ error: 'Cargo inválido' }, { status: 400 })
      }
      if (orgRole.systemKey === 'owner') {
        return NextResponse.json(
          { error: 'Não é possível convidar como proprietário' },
          { status: 400 },
        )
      }
      orgRoleId = orgRole.id
      roleLabel = orgRole.name
      if (orgRole.systemKey && isAccountRole(orgRole.systemKey)) {
        role = orgRole.systemKey
      } else {
        role = 'agent'
      }
    } else {
      role = body.role ?? 'agent'
      if (role === 'owner' || !['admin', 'agent', 'viewer'].includes(role)) {
        return NextResponse.json({ error: 'Cargo inválido' }, { status: 400 })
      }
      const systemRole = await prisma.orgRole.findFirst({
        where: { accountId: ctx.accountId, systemKey: role },
      })
      orgRoleId = systemRole?.id ?? null
      roleLabel = systemRole?.name ?? role
    }

    const days = clampExpiryDays(body.expiresInDays)
    const { token, hash } = generateInviteToken()
    const expiresAt = inviteExpiresAt(days)

    const invite = await prisma.accountInvitation.create({
      data: {
        accountId: ctx.accountId,
        tokenHash: hash,
        role,
        orgRoleId,
        email,
        label: body.label?.trim() || null,
        createdByUserId: ctx.userId,
        expiresAt,
      },
    })

    const site =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
      process.env.AUTH_URL?.replace(/\/$/, '') ||
      'http://localhost:3000'
    const url = inviteUrl(token, site)

    const emailResult = await sendInviteEmail({
      to: email,
      orgName: ctx.account.name,
      roleLabel,
      joinUrl: url,
      expiresAt,
    })

    return NextResponse.json({
      invitation: {
        id: invite.id,
        role: invite.role,
        org_role_id: invite.orgRoleId,
        email: invite.email,
        label: invite.label,
        created_at: invite.createdAt.toISOString(),
        expires_at: invite.expiresAt.toISOString(),
      },
      url,
      expiresInDays: days,
      emailSent: emailResult.sent,
      emailError: emailResult.reason,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
