import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'
import { notifyAccount } from '@/domain/db/notify'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params

    const conv = await prisma.conversation.findFirst({
      where: { id, accountId: session.accountId },
      select: { id: true, unreadCount: true },
    })
    if (!conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (conv.unreadCount > 0) {
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { unreadCount: 0 },
      })
      await notifyAccount({
        table: 'conversations',
        op: 'UPDATE',
        id: conv.id,
        accountId: session.accountId,
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, unread_count: 0 })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
