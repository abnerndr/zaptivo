import { prisma } from '@/lib/db/prisma'
import {
  getWahaContact,
  resolveLidToPhone,
} from '@/lib/whatsapp/waha-api'
import {
  digitsOnly,
  isLikelyLid,
  isLikelyPhoneNumber,
} from '@/lib/whatsapp/format-phone'
import { sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils'
import { mergeOpenConversationsForContact } from '@/lib/whatsapp/resolve-conversation'

/**
 * If `phoneOrLid` is a WhatsApp LID, ask WAHA for the real @c.us number.
 * Returns digits-only phone (or the original value if already a phone / unresolved).
 */
export async function resolveToPhoneNumber(args: {
  session: string
  phoneOrLid: string
}): Promise<{ phone: string; resolved: boolean; pushName?: string | null }> {
  const raw = args.phoneOrLid.trim()
  const digits = digitsOnly(raw)

  if (isLikelyPhoneNumber(digits) && !raw.includes('@lid')) {
    return { phone: sanitizePhoneForMeta(digits), resolved: false }
  }

  if (!isLikelyLid(digits) && !raw.includes('@lid')) {
    return { phone: sanitizePhoneForMeta(digits), resolved: false }
  }

  const lidJid = raw.includes('@lid') ? raw : `${digits}@lid`
  const pn = await resolveLidToPhone(args.session, lidJid)
  if (!pn) {
    return { phone: sanitizePhoneForMeta(digits), resolved: false }
  }

  const phone = sanitizePhoneForMeta(pn.split('@')[0] ?? pn)
  let pushName: string | null = null
  try {
    const contact = await getWahaContact(args.session, lidJid)
    pushName = contact?.pushname || contact?.name || null
  } catch {
    /* optional */
  }

  return { phone, resolved: true, pushName }
}

/**
 * Point a contact (and its open conversation) at the real phone number.
 * If another contact already owns that phone, merge conversations into it.
 */
export async function upgradeContactToPhone(args: {
  accountId: string
  contactId: string
  phone: string
  name?: string | null
}): Promise<{ contactId: string }> {
  const phone = sanitizePhoneForMeta(args.phone)
  if (!isLikelyPhoneNumber(phone)) {
    return { contactId: args.contactId }
  }

  const current = await prisma.contact.findFirst({
    where: { id: args.contactId, accountId: args.accountId },
  })
  if (!current) return { contactId: args.contactId }

  const other = await prisma.contact.findFirst({
    where: {
      accountId: args.accountId,
      id: { not: args.contactId },
      OR: [{ phone }, { phoneNormalized: phone }],
    },
  })

  if (other) {
    // Move conversations from LID contact → phone contact
    await prisma.conversation.updateMany({
      where: { contactId: current.id, accountId: args.accountId },
      data: { contactId: other.id },
    })
    if ((!other.name || !other.name.trim()) && (args.name || current.name)) {
      await prisma.contact.update({
        where: { id: other.id },
        data: { name: args.name || current.name },
      })
    }
    await mergeOpenConversationsForContact({
      accountId: args.accountId,
      contactId: other.id,
    })
    // Drop the LID stub if it has no conversations left
    const left = await prisma.conversation.count({
      where: { contactId: current.id },
    })
    if (left === 0) {
      await prisma.contact.delete({ where: { id: current.id } }).catch(() => {})
    }
    return { contactId: other.id }
  }

  await prisma.contact.update({
    where: { id: current.id },
    data: {
      phone,
      phoneNormalized: phone,
      ...((!current.name || !current.name.trim()) && args.name
        ? { name: args.name }
        : {}),
    },
  })
  await mergeOpenConversationsForContact({
    accountId: args.accountId,
    contactId: current.id,
  })
  return { contactId: current.id }
}

/** Backfill all LID-looking contacts for an account via WAHA lids API. */
export async function backfillLidContacts(args: {
  accountId: string
  session: string
}): Promise<{ upgraded: number }> {
  const contacts = await prisma.contact.findMany({
    where: { accountId: args.accountId },
    select: { id: true, phone: true, name: true },
  })

  let upgraded = 0
  for (const c of contacts) {
    if (!isLikelyLid(c.phone)) continue
    const resolved = await resolveToPhoneNumber({
      session: args.session,
      phoneOrLid: c.phone,
    })
    if (!resolved.resolved || !isLikelyPhoneNumber(resolved.phone)) continue
    await upgradeContactToPhone({
      accountId: args.accountId,
      contactId: c.id,
      phone: resolved.phone,
      name: resolved.pushName || c.name,
    })
    upgraded += 1
  }
  return { upgraded }
}
