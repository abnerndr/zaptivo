import { NextResponse } from 'next/server'
import { requireSessionAccount } from '@/domain/auth/context'
import { prisma } from '@/domain/db/prisma'
import { ensureSessionWorking } from '@/domain/whatsapp/waha-api'
import {
  syncWahaChatForPhone,
  syncWahaChats,
} from '@/domain/whatsapp/sync-chats'
import {
  dedupeAccountInbox,
  mergeOpenConversationsForContact,
} from '@/domain/whatsapp/resolve-conversation'

/**
 * Pull recent chats/messages from WAHA into the CRM inbox.
 *
 * Query:
 * - `?light=1` — faster poll (still starts session if STOPPED)
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

    const session = await ensureSessionWorking(config.wahaSession, {
      waitMs: light ? 12_000 : 25_000,
      updateWebhooks: !light,
    }).catch((err) => {
      console.warn('[whatsapp/sync] ensureSessionWorking', err)
      return null
    })

    if (session) {
      await prisma.whatsappConfig
        .update({
          where: { id: config.id },
          data: {
            status: session.status,
            connectedAt:
              session.status === 'WORKING' ? new Date() : config.connectedAt,
          },
        })
        .catch(() => {})
    }

    if (!session || session.status !== 'WORKING') {
      const status = session?.status ?? 'UNKNOWN'
      const payload = {
        ok: false,
        skipped: 'session_not_working',
        status,
        error:
          status === 'SCAN_QR_CODE'
            ? 'WhatsApp desconectado — escaneie o QR em Configurações'
            : `Sessão WhatsApp ${status}. Tentando reconectar…`,
      }
      // Background light polls should not spam 502
      if (light) return NextResponse.json(payload)
      return NextResponse.json(payload, { status: 503 })
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

    const dedupe = light
      ? null
      : await dedupeAccountInbox(ctx.accountId).catch(() => null)

    return NextResponse.json({ ok: true, ...result, dedupe })
  } catch (err) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Sync failed'
    console.error('[whatsapp/sync]', err)
    // Soft-fail background polls when WAHA is temporarily down
    const url = new URL(req.url)
    if (url.searchParams.get('light') === '1') {
      return NextResponse.json({ ok: false, error: message, skipped: 'waha_error' })
    }
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
