import { prisma } from '@/domain/db/prisma'
import { notifyAccount } from '@/domain/db/notify'
import { messageInsertPayload } from '@/domain/realtime/payload'
import {
  mergeOpenConversationsForContact,
  resolveConversation,
} from '@/domain/whatsapp/resolve-conversation'
import { sanitizePhoneForMeta } from '@/domain/whatsapp/phone-utils'
import { extractCanonicalMessageId } from '@/domain/whatsapp/message-id'
import { isLikelyLid, isLikelyPhoneNumber } from '@/domain/whatsapp/format-phone'
import {
  resolveToPhoneNumber,
  upgradeContactToPhone,
  findContactByLid,
  findPhoneContactByPushName,
  findContactByPhonePrefix,
  rememberContactLid,
} from '@/domain/whatsapp/resolve-lid'
import { pickContactJid, pickLidJid } from '@/domain/whatsapp/inbound-jid'
import { ensureContactAvatar } from '@/domain/whatsapp/ensure-contact-avatar'
import { settleInboundMedia } from '@/domain/whatsapp/inbound-media'
export { pickContactJid, pickLidJid } from '@/domain/whatsapp/inbound-jid'

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
 * Post-insert identity resolution: resolves @lid → phone through WAHA,
 * folds LID stubs into the phone contact, merges open threads and tells the
 * client if the message ended up in another conversation.
 */
async function settleContactIdentity(args: {
  accountId: string
  session?: string
  contactId: string
  conversationId: string
  messageId: string
  phone: string
  pushName: string | null
  lidJid: string | null
  jid: string
}): Promise<{ contactId: string; conversationId: string; phone: string }> {
  const { accountId, session, messageId, lidJid, jid } = args
  const conversationIdOriginal = args.conversationId
  let { contactId, phone, pushName } = args
  let resolvedLid: string | null = lidJid

  if (session) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { phone: true, name: true },
    })
    const contactPhone = contact?.phone ?? phone

    if (
      isLikelyLid(contactPhone) ||
      isLikelyLid(phone) ||
      jid.includes('@lid') ||
      lidJid
    ) {
      const resolved = await resolveToPhoneNumber({
        session,
        phoneOrLid: lidJid || (jid.includes('@lid') ? jid : contactPhone),
      })
      if (resolved.lid) resolvedLid = resolved.lid
      if (resolved.resolved && isLikelyPhoneNumber(resolved.phone)) {
        const upgraded = await upgradeContactToPhone({
          accountId,
          contactId,
          phone: resolved.phone,
          name: pushName || resolved.pushName || contact?.name,
          lid: resolved.lid || resolvedLid,
        })
        contactId = upgraded.contactId
        phone = resolved.phone
        if (!pushName && resolved.pushName) pushName = resolved.pushName
      } else {
        const byPrefix = await findContactByPhonePrefix({
          accountId,
          phoneOrLid: contactPhone,
        })
        if (byPrefix && byPrefix.id !== contactId) {
          const upgraded = await upgradeContactToPhone({
            accountId,
            contactId,
            phone: byPrefix.phone,
            name: pushName || byPrefix.name || contact?.name,
            lid: resolvedLid,
          })
          contactId = upgraded.contactId
          phone = sanitizePhoneForMeta(byPrefix.phone)
        } else if (pushName?.trim() && isLikelyLid(contactPhone)) {
          const byName = await findPhoneContactByPushName({
            accountId,
            pushName,
          })
          if (byName) {
            const upgraded = await upgradeContactToPhone({
              accountId,
              contactId,
              phone: byName.phone,
              name: pushName,
              lid: resolvedLid,
            })
            contactId = upgraded.contactId
            phone = sanitizePhoneForMeta(byName.phone)
          }
        }
      }
    }

    await mergeOpenConversationsForContact({
      accountId,
      contactId,
      keepId: conversationIdOriginal,
    })
  }

  if (pushName) {
    await prisma.contact.updateMany({
      where: {
        accountId,
        nameLocked: false,
        AND: [
          { OR: [{ phone }, { phoneNormalized: phone }] },
          { OR: [{ name: null }, { name: '' }] },
        ],
      },
      data: { name: pushName },
    })
  }

  // Always remember LID↔phone when we know both
  if (resolvedLid && isLikelyPhoneNumber(phone)) {
    await rememberContactLid({ accountId, contactId, lid: resolvedLid })
  }

  if (session) {
    void ensureContactAvatar({ accountId, contactId, session, phone })
  }

  // Message may have moved threads (contact upgrade / open-thread merge)
  const current = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true },
  })
  const survivingConversationId = current?.conversationId ?? conversationIdOriginal
  const moved = survivingConversationId !== conversationIdOriginal
  const identityChanged = contactId !== args.contactId || phone !== args.phone

  if (moved) {
    await notifyAccount({
      table: 'messages',
      op: 'UPDATE',
      id: messageId,
      accountId,
      conversationId: survivingConversationId,
      movedFromConversationId: conversationIdOriginal,
      movedToConversationId: survivingConversationId,
    }).catch(() => {})
  }

  if (moved || identityChanged) {
    await notifyAccount({
      table: 'conversations',
      op: 'UPDATE',
      id: survivingConversationId,
      accountId,
    }).catch(() => {})
  }

  if (moved) {
    // Let the thread the message left drop out of the list
    await notifyAccount({
      table: 'conversations',
      op: 'UPDATE',
      id: conversationIdOriginal,
      accountId,
    }).catch(() => {})
  }

  return { contactId, conversationId: survivingConversationId, phone }
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

  const pushName =
    payload.pushName ||
    payload._data?.pushName ||
    payload._data?.notifyName ||
    null

  const lidJid = pickLidJid(payload) || (jid.includes('@lid') ? jid : null)

  // Local cache only: remote LID resolution (WAHA) runs after the insert notify.
  if (lidJid || jid.includes('@lid') || isLikelyLid(phone)) {
    const byLid = await findContactByLid({
      accountId,
      lid: lidJid || phone,
    })
    if (byLid && isLikelyPhoneNumber(byLid.phone)) {
      phone = sanitizePhoneForMeta(byLid.phone)
    }
  }

  // Safety net: WAHA junk suffixes / unresolved LIDs → known phone contact
  if (!isLikelyPhoneNumber(phone) || isLikelyLid(phone)) {
    const byPrefix = await findContactByPhonePrefix({
      accountId,
      phoneOrLid: phone,
    })
    if (byPrefix) {
      phone = sanitizePhoneForMeta(byPrefix.phone)
    }
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

  const { conversationId, contactId } = await resolveConversation({
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

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderType: fromMe ? 'agent' : 'customer',
      contentType,
      contentText: text,
      // WAHA's internal url is not the final one: settleInboundMedia stores it in R2.
      mediaUrl: payload.hasMedia ? null : (payload.media?.url ?? null),
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

  await notifyAccount(
    messageInsertPayload({
      id: message.id,
      accountId,
      conversationId,
      contactId,
      text,
      fromMe,
      contentType,
      mediaUrl: message.mediaUrl,
      status: message.status,
      createdAt,
    }),
  ).catch(() => {})
  await notifyAccount({
    table: 'conversations',
    op: 'UPDATE',
    id: conversationId,
    accountId,
  }).catch(() => {})

  // The bubble is already out: download inbound media into R2 in the background.
  if (session && payload.hasMedia && payload.media?.url) {
    void settleInboundMedia({
      accountId,
      messageId: message.id,
      conversationId,
      mediaUrl: payload.media.url,
      mimetype: payload.media.mimetype ?? null,
      session,
    }).catch((err) => console.warn('[settleInboundMedia]', err))
  }

  // Identity resolution (WAHA lookups, contact merge) must not delay the bubble.
  void settleContactIdentity({
    accountId,
    session,
    contactId,
    conversationId,
    messageId: message.id,
    phone,
    pushName,
    lidJid,
    jid,
  }).catch((err) => console.warn('[settleContactIdentity]', err))

  return { ok: true, conversationId }
}
