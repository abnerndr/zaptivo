import {
  listChats,
  getChatMessages,
  type WahaChatSummary,
  type WahaChatMessage,
} from '@/lib/whatsapp/waha-api'
import {
  ingestWahaMessage,
  jidToPhone,
  type WahaMessagePayload,
} from '@/lib/whatsapp/inbound'
import { isLikelyLid, isLikelyPhoneNumber } from '@/lib/whatsapp/format-phone'
import {
  backfillLidContacts,
  resolveToPhoneNumber,
  upgradeContactToPhone,
} from '@/lib/whatsapp/resolve-lid'
import { prisma } from '@/lib/db/prisma'
import { ensureContactAvatar } from '@/lib/whatsapp/ensure-contact-avatar'

function chatToPayload(msg: WahaChatMessage): WahaMessagePayload {
  return {
    id: msg.id,
    timestamp: msg.timestamp,
    from: msg.from,
    to: msg.to,
    fromMe: msg.fromMe,
    body: msg.body,
    hasMedia: msg.hasMedia,
    media: msg.media ?? null,
    pushName: msg._data?.notifyName ?? msg._data?.pushName,
    _data: msg._data ?? null,
  }
}

/**
 * Pull recent WAHA chats/messages into Prisma — used when webhooks
 * were misconfigured (e.g. localhost SITE_URL) or to backfill history.
 */
export async function syncWahaChats(args: {
  accountId: string
  session: string
  chatLimit?: number
  messagesPerChat?: number
  /** Skip LID backfill — for frequent light polls */
  skipLidBackfill?: boolean
}): Promise<{ chats: number; messages: number; lidsUpgraded: number }> {
  const chatLimit = args.chatLimit ?? 40
  const messagesPerChat = args.messagesPerChat ?? 30

  let lidsUpgraded = 0
  if (!args.skipLidBackfill) {
    const result = await backfillLidContacts({
      accountId: args.accountId,
      session: args.session,
    })
    lidsUpgraded = result.upgraded
  }

  let chats: WahaChatSummary[] = []
  try {
    chats = await listChats(args.session, chatLimit)
  } catch (err) {
    console.warn('[syncWahaChats] listChats failed:', err)
    throw err
  }

  let messages = 0
  for (const chat of chats) {
    let chatId = chat.id || chat.chatId
    if (!chatId) continue
    if (
      chatId.includes('@g.us') ||
      chatId.includes('@newsletter') ||
      chatId.includes('status@broadcast')
    ) {
      continue
    }

    // Resolve @lid chat ids to @c.us before ingesting
    if (chatId.includes('@lid') || isLikelyLid(jidToPhone(chatId))) {
      const resolved = await resolveToPhoneNumber({
        session: args.session,
        phoneOrLid: chatId,
      })
      if (resolved.resolved && isLikelyPhoneNumber(resolved.phone)) {
        chatId = `${resolved.phone}@c.us`
      }
    }

    let rows: WahaChatMessage[] = []
    try {
      // Prefer messages from original chat id if list returned @lid
      const fetchId = chat.id || chat.chatId || chatId
      rows = await getChatMessages(args.session, fetchId, messagesPerChat)
    } catch (err) {
      console.warn('[syncWahaChats] messages failed for', chatId, err)
      continue
    }

    const ordered = [...rows].sort(
      (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
    )

    let avatarContactId: string | null = null
    let avatarPhone: string | null = null

    for (const row of ordered) {
      const payload = chatToPayload(row)
      if (chatId.includes('@c.us')) {
        if (payload.fromMe) {
          payload.to = chatId
        } else {
          payload.from = chatId
        }
        payload._data = {
          ...(payload._data ?? {}),
          key: {
            ...(payload._data?.key ?? {}),
            remoteJidAlt: chatId,
          },
        }
      }

      const result = await ingestWahaMessage({
        accountId: args.accountId,
        payload,
        session: args.session,
      })
      if (result.ok && result.reason !== 'duplicate') messages += 1

      if (result.conversationId && chatId.includes('@c.us')) {
        const phone = jidToPhone(chatId)
        if (isLikelyPhoneNumber(phone)) {
          const conv = await prisma.conversation.findUnique({
            where: { id: result.conversationId },
            select: {
              contactId: true,
              contact: { select: { phone: true, name: true } },
            },
          })
          if (conv && isLikelyLid(conv.contact.phone)) {
            await upgradeContactToPhone({
              accountId: args.accountId,
              contactId: conv.contactId,
              phone,
              name: chat.name || conv.contact.name,
            })
          }
          if (conv && !avatarContactId) {
            avatarContactId = conv.contactId
            avatarPhone = phone
          }
        }
      }
    }

    if (avatarContactId && avatarPhone) {
      void ensureContactAvatar({
        accountId: args.accountId,
        contactId: avatarContactId,
        session: args.session,
        phone: avatarPhone,
      })
    }
  }

  return { chats: chats.length, messages, lidsUpgraded }
}

/**
 * Pull recent messages for a single contact phone / LID into Prisma.
 * Used while a conversation is open so inbound shows up without full sync.
 */
export async function syncWahaChatForPhone(args: {
  accountId: string
  session: string
  phone: string
  messagesLimit?: number
  preferConversationId?: string | null
  sinceUnix?: number
}): Promise<{ messages: number }> {
  const phone = args.phone.replace(/\D/g, '')
  if (!phone) return { messages: 0 }

  const candidates = [`${phone}@c.us`, `${phone}@lid`]
  let rows: WahaChatMessage[] = []
  let resolvedChatId: string | null = null
  const fetchOpts = args.sinceUnix ? { sinceUnix: args.sinceUnix } : undefined

  for (const chatId of candidates) {
    try {
      rows = await getChatMessages(
        args.session,
        chatId,
        args.messagesLimit ?? 30,
        fetchOpts,
      )
      if (rows.length > 0) {
        resolvedChatId = chatId
        break
      }
    } catch {
      /* try next candidate */
    }
  }

  // Fallback without timestamp filter if filtered query returned empty
  if ((!resolvedChatId || rows.length === 0) && args.sinceUnix) {
    for (const chatId of candidates) {
      try {
        rows = await getChatMessages(
          args.session,
          chatId,
          args.messagesLimit ?? 30,
        )
        if (rows.length > 0) {
          resolvedChatId = chatId
          break
        }
      } catch {
        /* try next */
      }
    }
  }

  if (!resolvedChatId || rows.length === 0) {
    if (isLikelyLid(phone)) {
      const resolved = await resolveToPhoneNumber({
        session: args.session,
        phoneOrLid: phone,
      })
      if (resolved.resolved && isLikelyPhoneNumber(resolved.phone)) {
        return syncWahaChatForPhone({
          ...args,
          phone: resolved.phone,
        })
      }
    }
    return { messages: 0 }
  }

  let targetChatId = resolvedChatId
  if (targetChatId.includes('@lid') || isLikelyLid(jidToPhone(targetChatId))) {
    const resolved = await resolveToPhoneNumber({
      session: args.session,
      phoneOrLid: targetChatId,
    })
    if (resolved.resolved && isLikelyPhoneNumber(resolved.phone)) {
      targetChatId = `${resolved.phone}@c.us`
    }
  }

  let messages = 0
  const ordered = [...rows].sort(
    (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
  )

  for (const row of ordered) {
    const payload = chatToPayload(row)
    if (targetChatId.includes('@c.us')) {
      if (payload.fromMe) {
        payload.to = targetChatId
      } else {
        payload.from = targetChatId
      }
      payload._data = {
        ...(payload._data ?? {}),
        key: {
          ...(payload._data?.key ?? {}),
          remoteJidAlt: targetChatId,
        },
      }
    }

    const result = await ingestWahaMessage({
      accountId: args.accountId,
      payload,
      session: args.session,
      preferConversationId: args.preferConversationId,
    })
    if (result.ok && result.reason !== 'duplicate') messages += 1
  }

  return { messages }
}
