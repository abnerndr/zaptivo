import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import {
  dedupeAccountInbox,
  mergeOpenConversationsForContact,
} from '@/lib/whatsapp/resolve-conversation'

/** Avoid running heavy contact-merge on every 2s inbox poll */
const lastFullDedupe = new Map<string, number>()
const FULL_DEDUPE_TTL_MS = 60_000

export async function GET(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const url = new URL(req.url)
    const status = url.searchParams.get('status')

    const now = Date.now()
    const last = lastFullDedupe.get(ctx.accountId) ?? 0
    if (now - last > FULL_DEDUPE_TTL_MS) {
      lastFullDedupe.set(ctx.accountId, now)
      await dedupeAccountInbox(ctx.accountId).catch((err) =>
        console.warn('[inbox/conversations] dedupe failed:', err),
      )
    } else {
      // Cheap path: only collapse open threads that are already duplicated
      const openRows = await prisma.conversation.findMany({
        where: { accountId: ctx.accountId, status: { not: 'closed' } },
        select: { contactId: true },
      })
      const counts = new Map<string, number>()
      for (const row of openRows) {
        counts.set(row.contactId, (counts.get(row.contactId) ?? 0) + 1)
      }
      for (const [contactId, n] of counts) {
        if (n > 1) {
          await mergeOpenConversationsForContact({
            accountId: ctx.accountId,
            contactId,
          }).catch(() => {})
        }
      }
    }

    const rows = await prisma.conversation.findMany({
      where: {
        accountId: ctx.accountId,
        ...(status ? { status } : { status: { not: 'closed' } }),
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: {
        contact: true,
      },
    })

    // One row per contact (latest activity wins)
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
