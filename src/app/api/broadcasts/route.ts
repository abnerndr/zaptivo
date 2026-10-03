import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'
import {
  parseAudienceFilter,
  resolveAudienceContactIds,
} from '@/domain/broadcasts/audience'
import { serializeBroadcast } from '@/domain/broadcasts/serialize'

export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const rows = await prisma.broadcast.findMany({
      where: { accountId: ctx.accountId },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ broadcasts: rows.map(serializeBroadcast) })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await req.json()) as {
      name?: string
      template_name?: string
      template_language?: string
      audience_filter?: unknown
      scheduled_at?: string | null
    }
    const name = body.name?.trim()
    const templateName = body.template_name?.trim()
    if (!name || !templateName) {
      return NextResponse.json(
        { error: 'name and template_name required' },
        { status: 400 },
      )
    }
    const filter = parseAudienceFilter(body.audience_filter)
    const contactIds = await resolveAudienceContactIds(ctx.accountId, filter)
    const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : null

    const broadcast = await prisma.$transaction(async (tx) => {
      const created = await tx.broadcast.create({
        data: {
          accountId: ctx.accountId,
          userId: ctx.userId,
          name,
          templateName,
          templateLanguage: body.template_language?.trim() || 'pt_BR',
          audienceFilter: filter as unknown as Prisma.InputJsonValue,
          scheduledAt,
          status: 'draft',
          totalRecipients: contactIds.length,
        },
      })
      if (contactIds.length > 0) {
        await tx.broadcastRecipient.createMany({
          data: contactIds.map((contactId) => ({
            broadcastId: created.id,
            contactId,
            status: 'pending',
          })),
        })
      }
      return created
    })

    return NextResponse.json(
      { broadcast: serializeBroadcast(broadcast) },
      { status: 201 },
    )
  } catch (err) {
    if (err instanceof Response) return err
    console.error('[api/broadcasts POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
