import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import { notifyAccount } from '@/lib/db/notify'

function serialize(n: {
  id: string
  accountId: string
  userId: string
  type: string
  conversationId: string | null
  contactId: string | null
  actorUserId: string | null
  title: string
  body: string | null
  readAt: Date | null
  createdAt: Date
}) {
  return {
    id: n.id,
    account_id: n.accountId,
    user_id: n.userId,
    type: n.type,
    conversation_id: n.conversationId,
    contact_id: n.contactId,
    actor_user_id: n.actorUserId,
    title: n.title,
    body: n.body,
    read_at: n.readAt?.toISOString() ?? null,
    created_at: n.createdAt.toISOString(),
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await requireSessionAccount()
    const url = new URL(request.url)
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50),
    )
    const unreadOnly = url.searchParams.get('unread') === '1'

    const rows = await prisma.notification.findMany({
      where: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({
      notifications: rows.map(serialize),
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/** Mark notifications as read: `{ all: true }` or `{ ids: string[] }`. */
export async function PATCH(request: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await request.json().catch(() => ({}))) as {
      all?: boolean
      ids?: string[]
    }

    const now = new Date()
    let updated = 0

    if (body.all) {
      const result = await prisma.notification.updateMany({
        where: {
          accountId: ctx.accountId,
          userId: ctx.userId,
          readAt: null,
        },
        data: { readAt: now },
      })
      updated = result.count
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      const result = await prisma.notification.updateMany({
        where: {
          accountId: ctx.accountId,
          userId: ctx.userId,
          id: { in: body.ids },
          readAt: null,
        },
        data: { readAt: now },
      })
      updated = result.count
    } else {
      return NextResponse.json(
        { error: 'Provide all:true or ids:[]' },
        { status: 400 },
      )
    }

    if (updated > 0) {
      await notifyAccount({
        table: 'notifications',
        op: 'UPDATE',
        id: ctx.userId,
        accountId: ctx.accountId,
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, updated })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
