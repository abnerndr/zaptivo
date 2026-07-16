import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'

export async function GET(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const rows = await prisma.conversation.findMany({
      where: {
        accountId: ctx.accountId,
        ...(status ? { status } : {}),
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: {
        contact: true,
      },
    })
    return NextResponse.json({
      conversations: rows.map((c) => ({
        id: c.id,
        status: c.status,
        unread_count: c.unreadCount,
        last_message_text: c.lastMessageText,
        last_message_at: c.lastMessageAt,
        assigned_agent_id: c.assignedAgentId,
        contact: c.contact
          ? {
              id: c.contact.id,
              name: c.contact.name,
              phone: c.contact.phone,
              avatar_url: c.contact.avatarUrl,
            }
          : null,
      })),
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
