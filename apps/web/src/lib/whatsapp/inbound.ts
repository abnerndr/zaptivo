import { prisma } from '@/lib/db/prisma'
import { notifyAccount } from '@/lib/db/notify'
import {
  mergeOpenConversationsForContact,
  resolveConversation,
} from '@/lib/whatsapp/resolve-conversation'
import { sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils'
import { extractCanonicalMessageId } from '@/lib/whatsapp/message-id'
import { isLikelyLid, isLikelyPhoneNumber } from '@/lib/whatsapp/format-phone'
import {
  resolveToPhoneNumber,
  upgradeContactToPhone,
  findContactByLid,
  findPhoneContactByPushName,
  findContactByPhonePrefix,
  rememberContactLid,
} from '@/lib/whatsapp/resolve-lid'
import { pickContactJid, pickLidJid } from '@/lib/whatsapp/inbound-jid'
import { ensureContactAvatar } from '@/lib/whatsapp/ensure-contact-avatar'
import { dispatchInboundToFlows } from '@/lib/flows/engine'

export { pickContactJid, pickLidJid } from '@/lib/whatsapp/inbound-jid'

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

  const lidJid = pickLidJid(payload) || (jid.includes('@lid') ? jid : null)
  let resolvedLid: string | null = lidJid

  // Resolve WhatsApp Linked ID → real phone BEFORE creating a contact stub
  if (session && (isLikelyLid(phone) || jid.includes('@lid') || lidJid)) {
    const resolved = await resolveToPhoneNumber({
      session,
      phoneOrLid: lidJid || (jid.includes('@') ? jid : phone),
    })
    if (resolved.lid) resolvedLid = resolved.lid
    if (resolved.resolved && isLikelyPhoneNumber(resolved.phone)) {
      phone = resolved.phone
      if (!pushName && resolved.pushName) pushName = resolved.pushName
    } else if (isLikelyLid(phone) || jid.includes('@lid')) {
      // Cache hit: we already know this LID belongs to a phone contact
      const byLid = await findContactByLid({
        accountId,
        lid: resolvedLid || phone,
      })
      if (byLid && isLikelyPhoneNumber(byLid.phone)) {
        phone = sanitizePhoneForMeta(byLid.phone)
      } else {
        // WAHA junk JID e.g. 551699635630251@lid → prefix of real phone
        const byPrefix = await findContactByPhonePrefix({
          accountId,
          phoneOrLid: phone,
        })
        if (byPrefix) {
          phone = sanitizePhoneForMeta(byPrefix.phone)
        } else if (pushName?.trim()) {
          // Match saved contact by WhatsApp push name (e.g. "Matheus Prado")
          const byName = await findPhoneContactByPushName({
            accountId,
            pushName,
          })
          if (byName) {
            phone = sanitizePhoneForMeta(byName.phone)
          }
        }
      }
    } else {
      // Even non-LID JIDs can be phone+junk — try prefix before creating
      const byPrefix = await findContactByPhonePrefix({
        accountId,
        phoneOrLid: phone,
      })
      if (byPrefix && byPrefix.phone !== phone) {
        phone = sanitizePhoneForMeta(byPrefix.phone)
      }
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

  let { conversationId, contactId } = await resolveConversation({
    accountId,
    phone,
    contactName: pushName,
    preferConversationId: args.preferConversationId,
  })

  // Fold LID stubs into the real phone contact BEFORE inserting the message
  if (session) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { phone: true, name: true, whatsappLid: true },
    })
    const contactPhone = contact?.phone ?? phone

    if (isLikelyLid(contactPhone) || isLikelyLid(phone) || jid.includes('@lid') || lidJid) {
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

    const keepId = await mergeOpenConversationsForContact({
      accountId,
      contactId,
      keepId: args.preferConversationId,
    })
    if (keepId) conversationId = keepId
  }

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
    await rememberContactLid({
      accountId,
      contactId,
      lid: resolvedLid,
    })
  }

  if (session) {
    void ensureContactAvatar({
      accountId,
      contactId,
      session,
      phone,
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

  if (!fromMe && text?.trim()) {
    const priorCustomer = await prisma.message.count({
      where: {
        conversation: { contactId, accountId },
        senderType: 'customer',
        id: { not: message.id },
      },
    })
    void dispatchInboundToFlows({
      accountId,
      contactId,
      conversationId,
      phone,
      text: text.trim(),
      isFirstInbound: priorCustomer === 0,
    }).catch((err) => console.error('[flows dispatch]', err))
  }

  return { ok: true, conversationId }
}
