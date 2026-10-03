import { prisma } from '@/domain/db/prisma'
import {
  getWahaContact,
  resolveLidToPhone,
  resolvePhoneToLid,
} from '@/domain/whatsapp/waha-api'
import {
  digitsOnly,
  isLikelyLid,
  isLikelyPhoneNumber,
} from '@/domain/whatsapp/format-phone'
import { sanitizePhoneForMeta, phonesMatch } from '@/domain/whatsapp/phone-utils'
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
  if (incoming.length < 12) return null

  // Prefer extracting a valid BR phone prefix (13 then 12 digits)
  const candidates: string[] = []
  if (incoming.startsWith('55')) {
    if (incoming.length >= 13) candidates.push(incoming.slice(0, 13))
    if (incoming.length >= 12) candidates.push(incoming.slice(0, 12))
  }
  candidates.push(incoming)

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

  // Broader: any phone contact that phonesMatch the incoming digits
  const contacts = await prisma.contact.findMany({
    where: { accountId: args.accountId },
    select: { id: true, phone: true, name: true, phoneNormalized: true },
    take: 500,
  })
  const matches = contacts.filter(
    (c) =>
      isLikelyPhoneNumber(c.phone) &&
      (phonesMatch(c.phone, incoming) ||
        (c.phoneNormalized ? phonesMatch(c.phoneNormalized, incoming) : false)),
  )
  if (matches.length === 1) return matches[0]!
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

  const lidJid = raw.includes('@lid') ? raw : `${digits}@lid`

  // 1) Official lids API
  const pn = await resolveLidToPhone(args.session, lidJid)
  if (pn) {
    const phone = sanitizePhoneForMeta(pn.split('@')[0] ?? pn)
    let pushName: string | null = null
    try {
      const contact = await getWahaContact(args.session, lidJid)
      pushName = contact?.pushname || contact?.name || null
    } catch {
      /* optional */
    }
    if (isLikelyPhoneNumber(phone)) {
      return { phone, resolved: true, pushName, lid: lidDigits(lidJid) }
    }
  }

  // 2) Contact profile may expose number / @c.us id even when lids API is null
  try {
    const contact = await getWahaContact(args.session, lidJid)
    const candidates = [contact?.number, contact?.id]
    for (const c of candidates) {
      if (!c) continue
      const phone = sanitizePhoneForMeta(
        String(c).includes('@') ? String(c).split('@')[0]! : String(c),
      )
      if (isLikelyPhoneNumber(phone) && !String(c).includes('@lid')) {
        return {
          phone,
          resolved: true,
          pushName: contact?.pushname || contact?.name || null,
          lid: lidDigits(lidJid),
        }
      }
    }
  } catch {
    /* optional */
  }

  return {
    phone: sanitizePhoneForMeta(digits),
    resolved: false,
    lid: lidDigits(lidJid),
  }
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

  let other = otherExact
  if (!other) {
    const candidates = await prisma.contact.findMany({
      where: { accountId: args.accountId, id: { not: args.contactId } },
      select: { id: true, phone: true, phoneNormalized: true },
      take: 500,
    })
    const match = candidates.find(
      (c) =>
        phonesMatch(c.phone, phone) ||
        (c.phoneNormalized ? phonesMatch(c.phoneNormalized, phone) : false),
    )
    if (match) {
      other = await prisma.contact.findUnique({ where: { id: match.id } })
    }
  }

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

  await prisma.contact.update({
    where: { id: current.id },
    data: {
      phone,
      phoneNormalized: phone,
      ...((!current.name || !current.name.trim()) && args.name
        ? { name: args.name }
        : {}),
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

/** Best-effort: learn LID for a phone contact via WAHA (after send / sync). */
export async function learnLidForPhoneContact(args: {
  accountId: string
  contactId: string
  session: string
  phone: string
}): Promise<void> {
  if (!isLikelyPhoneNumber(args.phone)) return
  try {
    const existing = await prisma.contact.findFirst({
      where: { id: args.contactId, accountId: args.accountId },
      select: { whatsappLid: true },
    })
    if (existing?.whatsappLid) return
    const lid = await resolvePhoneToLid(args.session, args.phone)
    if (lid) {
      await rememberContactLid({
        accountId: args.accountId,
        contactId: args.contactId,
        lid,
      })
    }
  } catch (err) {
    console.warn('[learnLidForPhoneContact]', err)
  }
}

/** Backfill all LID-looking contacts for an account via WAHA lids API. */
export async function backfillLidContacts(args: {
  accountId: string
  session: string
}): Promise<{ upgraded: number }> {
  const contacts = await prisma.contact.findMany({
    where: { accountId: args.accountId },
    select: { id: true, phone: true, name: true, whatsappLid: true },
  })

  let upgraded = 0
  for (const c of contacts) {
    if (isLikelyLid(c.phone)) {
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
        lid: resolved.lid || c.phone,
      })
      upgraded += 1
      continue
    }

    // Phone contact without cached LID — learn it for future inbound
    if (isLikelyPhoneNumber(c.phone) && !c.whatsappLid) {
      await learnLidForPhoneContact({
        accountId: args.accountId,
        contactId: c.id,
        session: args.session,
        phone: c.phone,
      })
    }
  }
  return { upgraded }
}
