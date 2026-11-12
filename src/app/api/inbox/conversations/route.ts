import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'
import { getOrgRolePermissions } from '@/domain/auth/org-roles'
import { canSendMessages } from '@/domain/auth/roles'
import {
  InboxConversationError,
  openInboxConversation,
} from '@/domain/inbox/open-conversation'

export async function GET(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const url = new URL(req.url)
    const status = url.searchParams.get('status')

    const rows = await prisma.conversation.findMany({
      where: {
        accountId: ctx.accountId,
        ...(status ? { status } : { status: { not: 'closed' } }),
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: { contact: true },
    })

    const seenContact = new Set<string>()
    const unique = []
    for (const c of rows) {
      if (seenContact.has(c.contactId)) continue
      seenContact.add(c.contactId)
      unique.push(c)
    }

    return NextResponse.json({
      conversations: unique.map((c) => ({
        id: c.id,
        status: c.status,
        unread_count: c.unreadCount,
        last_message_text: c.lastMessageText,
        last_message_at: c.lastMessageAt?.toISOString() ?? null,
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

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const permissions = await getOrgRolePermissions(ctx.profile.orgRoleId)
    if (
      ctx.role === 'viewer' ||
      !canSendMessages({ accountRole: ctx.role, permissions })
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = (await req.json()) as { contactId?: string; phone?: string }
    const opened = await openInboxConversation({
      accountId: ctx.accountId,
      contactId: body.contactId,
      phone: body.phone,
    })
    return NextResponse.json(opened)
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof InboxConversationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[inbox/conversations POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
