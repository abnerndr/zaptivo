import { prisma } from '@/lib/db/prisma'
import { notifyAccount } from '@/lib/db/notify'
import { resolveConversation } from '@/lib/whatsapp/resolve-conversation'
import { sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils'
import { extractCanonicalMessageId } from '@/lib/whatsapp/message-id'
import { isLikelyLid, isLikelyPhoneNumber } from '@/lib/whatsapp/format-phone'
import { resolveToPhoneNumber } from '@/lib/whatsapp/resolve-lid'

export type WahaMessagePayload = {
  id?: string
  timestamp?: number
  from?: string
  to?: string
  fromMe?: boolean
  source?: string
  body?: string | null
  hasMedia?: boolean
  media?: {
    url?: string | null
    mimetype?: string | null
    filename?: string | null
  } | null
  _data?: {
    pushName?: string
    notifyName?: string
    key?: {
      id?: string
      remoteJid?: string
      remoteJidAlt?: string
      fromMe?: boolean
    }
    Info?: {
      Chat?: string
      RecipientAlt?: string
      SenderAlt?: string
      ID?: string
    }
  } | null
  pushName?: string
}

function isGroupOrBroadcast(jid: string | undefined | null): boolean {
  if (!jid) return false
  return (
    jid.includes('@g.us') ||
    jid.includes('@newsletter') ||
    jid.includes('status@broadcast') ||
    jid.includes('@broadcast')
  )
}

/** Prefer real phone JID over @lid (NOWEB/GOWS). */
export function pickContactJid(payload: WahaMessagePayload): string | null {
  const key = payload._data?.key
  const info = payload._data?.Info
  const candidates = [
    key?.remoteJidAlt,
    info?.RecipientAlt,
    info?.SenderAlt,
    payload.fromMe ? payload.to : payload.from,
    key?.remoteJid,
    info?.Chat,
    payload.fromMe ? payload.from : payload.to,
  ]
  for (const jid of candidates) {
    if (!jid || isGroupOrBroadcast(jid)) continue
    if (jid.includes('@lid')) continue
    return jid
  }
  for (const jid of candidates) {
    if (!jid || isGroupOrBroadcast(jid)) continue
    return jid
  }
  return null
}

export function jidToPhone(jid: string): string {
  return sanitizePhoneForMeta(jid.split('@')[0] ?? '')
}

function contentTypeFromPayload(payload: WahaMessagePayload): string {
  if (!payload.hasMedia) return 'text'
  const mime = payload.media?.mimetype ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'document'
}

function parseCreatedAt(payload: WahaMessagePayload): Date {
  const ts = payload.timestamp
  if (ts && Number.isFinite(ts)) {
    return new Date(ts > 1e12 ? ts : ts * 1000)
  }
  return new Date()
}

async function findExistingMessage(args: {
  accountId: string
  conversationId?: string
  waMessageId: string | null
  fromMe: boolean
  text: string | null
  createdAt: Date
}) {
  if (args.waMessageId) {
    // Match exact or WAHA-prefixed forms that end with the same id
    const byId = await prisma.message.findFirst({
      where: {
        conversation: { accountId: args.accountId },
        OR: [
          { messageId: args.waMessageId },
          { messageId: { endsWith: `_${args.waMessageId}` } },
        ],
      },
      select: { id: true, conversationId: true },
    })
    if (byId) return byId
    // Solid provider id → never soft-collapse distinct messages
    return null
  }

  // Soft dedupe only when WAHA gave us no id (webhook+sync races)
  if (args.conversationId && args.text) {
    const windowMs = 90_000
    const soft = await prisma.message.findFirst({
      where: {
        conversationId: args.conversationId,
        senderType: args.fromMe ? 'agent' : 'customer',
        contentText: args.text,
        createdAt: {
          gte: new Date(args.createdAt.getTime() - windowMs),
          lte: new Date(args.createdAt.getTime() + windowMs),
        },
      },
      select: { id: true, conversationId: true },
    })
    if (soft) return soft
  }

  return null
}

/**
 * Persist a WAHA `message` / `message.any` event into contact/conversation/message.
 */
export async function ingestWahaMessage(args: {
  accountId: string
  payload: WahaMessagePayload
  /** WAHA session name — used to resolve @lid → phone */
  session?: string
  /** Force messages into this conversation (open inbox thread) */
  preferConversationId?: string | null
}): Promise<{ ok: boolean; reason?: string; conversationId?: string }> {
  const { accountId, payload } = args
  const jid = pickContactJid(payload)
  if (!jid) {
    return { ok: false, reason: 'skip_no_jid' }
  }
  if (isGroupOrBroadcast(jid)) {
    return { ok: false, reason: 'skip_group' }
  }

  let phone = jidToPhone(jid)
  if (!phone || phone.length < 7) {
    return { ok: false, reason: 'skip_bad_phone' }
  }

  let session = args.session
  if (!session) {
    const cfg = await prisma.whatsappConfig.findUnique({
      where: { accountId },
      select: { wahaSession: true },
    })
    session = cfg?.wahaSession
  }

  let pushName =
    payload.pushName ||
    payload._data?.pushName ||
    payload._data?.notifyName ||
    null

  // Resolve WhatsApp Linked ID → real phone before creating/finding contact
  if (session && (isLikelyLid(phone) || jid.includes('@lid'))) {
    const resolved = await resolveToPhoneNumber({
      session,
      phoneOrLid: jid.includes('@') ? jid : phone,
    })
    if (resolved.resolved && isLikelyPhoneNumber(resolved.phone)) {
      phone = resolved.phone
      if (!pushName && resolved.pushName) pushName = resolved.pushName
    }
  }

  if (!isLikelyPhoneNumber(phone) && isLikelyLid(phone)) {
    // Still a LID — store temporarily but mark via digits; sync/backfill will upgrade
  }

  const waMessageId = extractCanonicalMessageId(payload)
  const fromMe = Boolean(payload.fromMe)
  const contentType = contentTypeFromPayload(payload)
  const text =
    (payload.body && String(payload.body).trim()) ||
    (contentType !== 'text' ? `[${contentType}]` : null)
  const createdAt = parseCreatedAt(payload)

  const earlyDup = await findExistingMessage({
    accountId,
    waMessageId,
    fromMe,
    text,
    createdAt,
  })
  if (earlyDup) {
    return {
      ok: true,
      reason: 'duplicate',
      conversationId: earlyDup.conversationId,
    }
  }

  const { conversationId } = await resolveConversation({
    accountId,
    phone,
    contactName: pushName,
    preferConversationId: args.preferConversationId,
  })

  const lateDup = await findExistingMessage({
    accountId,
    conversationId,
    waMessageId,
    fromMe,
    text,
    createdAt,
  })
  if (lateDup) {
    return {
      ok: true,
      reason: 'duplicate',
      conversationId: lateDup.conversationId,
    }
  }

  if (pushName) {
    await prisma.contact.updateMany({
      where: {
        accountId,
        phoneNormalized: phone,
        OR: [{ name: null }, { name: '' }],
      },
      data: { name: pushName },
    })
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderType: fromMe ? 'agent' : 'customer',
      contentType,
      contentText: text,
      mediaUrl: payload.media?.url ?? null,
      messageId: waMessageId,
      status: fromMe ? 'sent' : 'delivered',
      createdAt,
    },
  })

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageText: text,
      lastMessageAt: createdAt,
      status: 'open',
      ...(fromMe ? {} : { unreadCount: { increment: 1 } }),
    },
  })

  await notifyAccount({
    table: 'messages',
    op: 'INSERT',
    id: message.id,
    accountId,
  }).catch(() => {})
  await notifyAccount({
    table: 'conversations',
    op: 'UPDATE',
    id: conversationId,
    accountId,
  }).catch(() => {})

  return { ok: true, conversationId }
}
