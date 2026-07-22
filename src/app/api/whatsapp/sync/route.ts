import { NextResponse } from 'next/server'
import { requireSessionAccount } from '@/lib/auth/context'
import { prisma } from '@/lib/db/prisma'
import {
  ensureSession,
  updateSessionWebhooks,
} from '@/lib/whatsapp/waha-api'
import {
  syncWahaChatForPhone,
  syncWahaChats,
} from '@/lib/whatsapp/sync-chats'
import {
  dedupeAccountInbox,
  mergeOpenConversationsForContact,
} from '@/lib/whatsapp/resolve-conversation'

/**
 * Pull recent chats/messages from WAHA into the CRM inbox.
 *
 * Query:
 * - `?light=1` — skip ensureSession + LID backfill (fast background poll)
 * - `?conversationId=` — sync only that contact's chat into that thread
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const url = new URL(req.url)
    const light = url.searchParams.get('light') === '1'
    const conversationId = url.searchParams.get('conversationId')

    const config = await prisma.whatsappConfig.findUnique({
      where: { accountId: ctx.accountId },
    })
    if (!config) {
      return NextResponse.json(
        { error: 'WhatsApp não configurado' },
        { status: 400 },
      )
    }

    if (light) {
      // Keep WAHA webhook pointed at a public URL (WAHA_WEBHOOK_URL / prod)
      void updateSessionWebhooks(config.wahaSession).catch(() => {})
    } else {
      await ensureSession(config.wahaSession).catch(() => null)
    }

    if (conversationId) {
      const conv = await prisma.conversation.findFirst({
        where: { id: conversationId, accountId: ctx.accountId },
        include: { contact: { select: { phone: true, id: true } } },
      })
      if (!conv?.contact?.phone) {
        return NextResponse.json(
          { error: 'Conversa não encontrada' },
          { status: 404 },
        )
      }

      const sinceUnix = conv.lastMessageAt
        ? Math.floor(conv.lastMessageAt.getTime() / 1000) - 120
        : undefined

      const result = await syncWahaChatForPhone({
        accountId: ctx.accountId,
        session: config.wahaSession,
        phone: conv.contact.phone,
        messagesLimit: light ? 40 : 50,
        preferConversationId: conversationId,
        sinceUnix,
      })

      await mergeOpenConversationsForContact({
        accountId: ctx.accountId,
        contactId: conv.contact.id,
        keepId: conversationId,
      }).catch(() => {})

      return NextResponse.json({ ok: true, chats: 1, ...result })
    }

    const result = await syncWahaChats({
      accountId: ctx.accountId,
      session: config.wahaSession,
      ...(light
        ? { chatLimit: 10, messagesPerChat: 25, skipLidBackfill: true }
        : {}),
    })

    // Full account cleanup after broad sync (all contacts)
    const dedupe = light
      ? null
      : await dedupeAccountInbox(ctx.accountId).catch(() => null)

    return NextResponse.json({ ok: true, ...result, dedupe })
  } catch (err) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Sync failed'
    console.error('[whatsapp/sync]', err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
