import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/domain/auth/account'
import { hasMinRole } from '@/domain/auth/roles'
import { prisma } from '@/domain/db/prisma'
import { getSession } from '@/domain/whatsapp/waha-api'

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const accountId = ctx.accountId

    const [
      memberCount,
      pendingInviteCount,
      tagCount,
      fieldCount,
      templateAgg,
      waConfig,
      profile,
    ] = await Promise.all([
      prisma.profile.count({ where: { accountId } }),
      hasMinRole(ctx.role, 'admin')
        ? prisma.accountInvitation.count({
            where: {
              accountId,
              acceptedAt: null,
              expiresAt: { gt: new Date() },
              NOT: { role: 'owner' },
            },
          })
        : Promise.resolve(0),
      prisma.tag.count({ where: { accountId } }),
      prisma.customField.count({ where: { accountId } }),
      prisma.messageTemplate.groupBy({
        by: ['status'],
        where: { accountId },
        _count: { _all: true },
      }),
      prisma.whatsappConfig.findUnique({ where: { accountId } }),
      prisma.profile.findUnique({
        where: { userId: ctx.userId },
        select: {
          fullName: true,
          email: true,
          avatarUrl: true,
          accountRole: true,
        },
      }),
    ])

    const templatesTotal = templateAgg.reduce((n, r) => n + r._count._all, 0)
    const templatesPending = templateAgg
      .filter((r) => r.status === 'DRAFT' || r.status === 'PENDING')
      .reduce((n, r) => n + r._count._all, 0)

    let waStatus: string | null = null
    let waDisplayName: string | null = null
    let waConfigured = false

    if (waConfig) {
      waConfigured = true
      waStatus = waConfig.status
      waDisplayName = waConfig.displayName
      try {
        const live = await getSession(waConfig.wahaSession)
        if (live?.status) {
          waStatus = live.status
          waDisplayName = live.me?.pushName ?? waDisplayName
        }
      } catch {
        /* WAHA unreachable — use stored status */
      }
    }

    return NextResponse.json({
      whatsapp: {
        configured: waConfigured,
        status: waStatus,
        display_name: waDisplayName,
      },
      members: {
        count: memberCount,
        pending_invites: pendingInviteCount,
      },
      templates: {
        count: templatesTotal,
        pending_review: templatesPending,
      },
      tags: { count: tagCount },
      fields: { count: fieldCount },
      profile: profile
        ? {
            full_name: profile.fullName,
            email: profile.email,
            avatar_url: profile.avatarUrl,
            role: profile.accountRole,
          }
        : null,
      account: {
        id: ctx.account.id,
        name: ctx.account.name,
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
