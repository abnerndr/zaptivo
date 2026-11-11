import { prisma } from '@/domain/db/prisma'
import { preferLockedName } from '@/domain/contacts/name-lock'
import {
  brPhonePrefixes,
  digitsOnly,
  isLikelyLid,
  isLikelyPhoneNumber,
} from '@/domain/whatsapp/format-phone'
import { sanitizePhoneForMeta } from '@/domain/whatsapp/phone-utils'
import { mergeOpenConversationsForContact } from '@/domain/whatsapp/resolve-conversation'

function lidDigits(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = digitsOnly(raw.includes('@') ? raw.split('@')[0] : raw)
  return d || null
}

/**
 * Persist LID ↔ phone mapping on the contact so future inbound @lid
 * events land on the same CRM thread without waiting for sync.
 */
export async function rememberContactLid(args: {
  accountId: string
  contactId: string
  lid: string | null | undefined
}): Promise<void> {
  const lid = lidDigits(args.lid)
  if (!lid) return
  try {
    // Clear this LID from any other contact in the account first
    await prisma.contact.updateMany({
      where: {
        accountId: args.accountId,
        whatsappLid: lid,
        id: { not: args.contactId },
      },
      data: { whatsappLid: null },
    })
    await prisma.contact.update({
      where: { id: args.contactId },
      data: { whatsappLid: lid },
    })
  } catch (err) {
    console.warn('[rememberContactLid]', err)
  }
}

export async function findContactByLid(args: {
  accountId: string
  lid: string
}): Promise<{ id: string; phone: string; name: string | null } | null> {
  const lid = lidDigits(args.lid)
  if (!lid) return null
  return prisma.contact.findFirst({
    where: { accountId: args.accountId, whatsappLid: lid },
    select: { id: true, phone: true, name: true },
  })
}

/**
 * Match inbound pushName to a unique saved phone contact.
 * Prefer exact name; fall back to a single phone contact whose name
 * starts with / contains the pushName (only when unambiguous).
 */
export async function findPhoneContactByPushName(args: {
  accountId: string
  pushName: string
}): Promise<{ id: string; phone: string; name: string | null } | null> {
  const name = args.pushName.trim()
  if (!name || name.length < 2) return null

  const exact = await prisma.contact.findMany({
    where: {
      accountId: args.accountId,
      name: { equals: name, mode: 'insensitive' },
    },
    select: { id: true, phone: true, name: true },
  })
  const exactPhone = exact.filter((c) => isLikelyPhoneNumber(c.phone))
  if (exactPhone.length === 1) return exactPhone[0]!

  const fuzzy = await prisma.contact.findMany({
    where: {
      accountId: args.accountId,
      name: { contains: name, mode: 'insensitive' },
    },
    select: { id: true, phone: true, name: true },
    take: 20,
  })
  const fuzzyPhone = fuzzy.filter((c) => isLikelyPhoneNumber(c.phone))
  if (fuzzyPhone.length === 1) return fuzzyPhone[0]!
  return null
}

/**
 * WAHA sometimes sends JIDs like `551699635630251@lid` — the real BR
 * phone plus a junk suffix. Match against known phone contacts by prefix.
 */
export async function findContactByPhonePrefix(args: {
  accountId: string
  phoneOrLid: string
}): Promise<{ id: string; phone: string; name: string | null } | null> {
  const incoming = digitsOnly(args.phoneOrLid)
  const candidates = brPhonePrefixes(incoming)
  for (const phone of candidates) {
    if (!isLikelyPhoneNumber(phone)) continue
    const exact = await prisma.contact.findFirst({
      where: {
        accountId: args.accountId,
        OR: [{ phone }, { phoneNormalized: phone }],
      },
      select: { id: true, phone: true, name: true },
    })
    if (exact && isLikelyPhoneNumber(exact.phone)) return exact
  }
  return null
}

/**
 * If `phoneOrLid` is a WhatsApp LID, ask WAHA for the real @c.us number.
 * Returns digits-only phone (or the original value if already a phone / unresolved).
 */
export async function resolveToPhoneNumber(args: {
  session: string
  phoneOrLid: string
}): Promise<{
  phone: string
  resolved: boolean
  pushName?: string | null
  lid?: string | null
}> {
  const raw = args.phoneOrLid.trim()
  const digits = digitsOnly(raw)
  const lid = raw.includes('@lid') || isLikelyLid(digits) ? lidDigits(raw) : null

  if (isLikelyPhoneNumber(digits) && !raw.includes('@lid')) {
    return { phone: sanitizePhoneForMeta(digits), resolved: false, lid }
  }

  if (!isLikelyLid(digits) && !raw.includes('@lid')) {
    return { phone: sanitizePhoneForMeta(digits), resolved: false, lid }
  }

  // WuzAPI events carry phone/LID mappings when available. Do not infer a
  // phone from an unresolved LID or query a different provider.
  return { phone: sanitizePhoneForMeta(digits), resolved: false, lid }

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
  lid?: string | null
}): Promise<{ contactId: string }> {
  const phone = sanitizePhoneForMeta(args.phone)
  if (!isLikelyPhoneNumber(phone)) {
    return { contactId: args.contactId }
  }

  const current = await prisma.contact.findFirst({
    where: { id: args.contactId, accountId: args.accountId },
  })
  if (!current) return { contactId: args.contactId }

  const otherExact = await prisma.contact.findFirst({
    where: {
      accountId: args.accountId,
      id: { not: args.contactId },
      OR: [{ phone }, { phoneNormalized: phone }],
    },
  })

  const other = otherExact

  if (other) {
    // Move conversations from LID contact → phone contact
    await prisma.conversation.updateMany({
      where: { contactId: current.id, accountId: args.accountId },
      data: { contactId: other.id },
    })
    const chosen = preferLockedName({
      current: { name: current.name, nameLocked: current.nameLocked },
      survivor: { name: other.name, nameLocked: other.nameLocked },
      pushName: args.name ?? null,
    })
    await prisma.contact.update({
      where: { id: other.id },
      data: { name: chosen.name, nameLocked: chosen.nameLocked },
    })
    await mergeOpenConversationsForContact({
      accountId: args.accountId,
      contactId: other.id,
    })
    const lid = args.lid || current.whatsappLid
    if (lid) {
      await rememberContactLid({
        accountId: args.accountId,
        contactId: other.id,
        lid,
      })
    }
    // Drop the LID stub if it has no conversations left
    const left = await prisma.conversation.count({
      where: { contactId: current.id },
    })
    if (left === 0) {
      await prisma.contact.delete({ where: { id: current.id } }).catch(() => {})
    }
    return { contactId: other.id }
  }

  const chosenSelf = preferLockedName({
    current: { name: null, nameLocked: false },
    survivor: { name: current.name, nameLocked: current.nameLocked },
    pushName: args.name ?? null,
  })
  await prisma.contact.update({
    where: { id: current.id },
    data: {
      phone,
      phoneNormalized: phone,
      name: chosenSelf.name,
      nameLocked: chosenSelf.nameLocked,
      ...(args.lid || current.whatsappLid
        ? { whatsappLid: lidDigits(args.lid || current.whatsappLid) }
        : {}),
    },
  })
  await mergeOpenConversationsForContact({
    accountId: args.accountId,
    contactId: current.id,
  })
  return { contactId: current.id }
}
