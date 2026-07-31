import { prisma } from '@/lib/db/prisma'
import { sanitizePhoneForMeta, phonesMatch } from '@/lib/whatsapp/phone-utils'
import { isLikelyLid } from '@/lib/whatsapp/format-phone'

/**
 * Find or create a conversation for an outbound/inbound phone number.
 * Always reuses a single open thread per contact (reopens closed if needed).
 */
export async function resolveConversation(args: {
  accountId: string
  phone: string
  contactName?: string | null
  /** When set, reuse this conversation if it belongs to the contact */
  preferConversationId?: string | null
}): Promise<{ conversationId: string; contactId: string; created: boolean }> {
  const phone = sanitizePhoneForMeta(args.phone)

  let contactId = await findOrCreateContact({
    accountId: args.accountId,
    phone,
    contactName: args.contactName,
  })

  if (args.preferConversationId) {
    const preferred = await prisma.conversation.findFirst({
      where: {
        id: args.preferConversationId,
        accountId: args.accountId,
      },
      include: { contact: { select: { id: true, phone: true, name: true } } },
    })
    if (preferred) {
      // Open thread may belong to the resolved phone contact while inbound
      // still arrived as LID — fold into the preferred contact/thread.
      if (preferred.contactId !== contactId) {
        const prefPhone = preferred.contact.phone
        const samePerson =
          phonesMatch(prefPhone, phone) ||
          isLikelyLid(phone) ||
          (!!args.contactName &&
            !!preferred.contact.name &&
            preferred.contact.name.trim().toLowerCase() ===
              args.contactName.trim().toLowerCase())
        if (samePerson) {
          await prisma.conversation.updateMany({
            where: { contactId, accountId: args.accountId },
            data: { contactId: preferred.contactId },
          })
          const left = await prisma.conversation.count({
            where: { contactId },
          })
          if (left === 0) {
            await prisma.contact
              .delete({ where: { id: contactId } })
              .catch(() => {})
          }
          contactId = preferred.contactId
        }
      }

      if (preferred.contactId === contactId) {
        if (preferred.status === 'closed') {
          await prisma.conversation.update({
            where: { id: preferred.id },
            data: { status: 'open' },
          })
        }
        await mergeOpenConversationsForContact({
          accountId: args.accountId,
          contactId,
          keepId: preferred.id,
        })
        return { conversationId: preferred.id, contactId, created: false }
      }
    }
  }

  const keepId = await mergeOpenConversationsForContact({
    accountId: args.accountId,
    contactId,
  })
  if (keepId) {
    return { conversationId: keepId, contactId, created: false }
  }

  // Reuse a closed conversation instead of opening a parallel thread
  const closed = await prisma.conversation.findFirst({
    where: { accountId: args.accountId, contactId },
    orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
  })
  if (closed) {
    await prisma.conversation.update({
      where: { id: closed.id },
      data: { status: 'open' },
    })
    return { conversationId: closed.id, contactId, created: false }
  }

  const createdConv = await prisma.conversation.create({
    data: {
      accountId: args.accountId,
      contactId,
      status: 'open',
    },
  })

  return { conversationId: createdConv.id, contactId, created: true }
}

async function findOrCreateContact(args: {
  accountId: string
  phone: string
  contactName?: string | null
}): Promise<string> {
  const { accountId, phone, contactName } = args

  const exact = await prisma.contact.findFirst({
    where: {
      accountId,
      OR: [{ phone }, { phoneNormalized: phone }],
    },
  })
  if (exact) {
    if (contactName && (!exact.name || !exact.name.trim())) {
      await prisma.contact.update({
        where: { id: exact.id },
        data: { name: contactName },
      })
    }
    return exact.id
  }

  // Fuzzy match (trunk prefix / missing country code) before creating
  const candidates = await prisma.contact.findMany({
    where: { accountId },
    select: { id: true, phone: true, phoneNormalized: true, name: true },
    take: 500,
  })
  const fuzzy = candidates.find(
    (c) =>
      phonesMatch(c.phone, phone) ||
      (c.phoneNormalized ? phonesMatch(c.phoneNormalized, phone) : false),
  )
  if (fuzzy) {
    // Normalize stored phone to the resolved form when we have a better number
    if (phone.length >= (fuzzy.phone?.length ?? 0)) {
      await prisma.contact.update({
        where: { id: fuzzy.id },
        data: {
          phone,
          phoneNormalized: phone,
          ...((!fuzzy.name || !fuzzy.name.trim()) && contactName
            ? { name: contactName }
            : {}),
        },
      })
    }
    return fuzzy.id
  }

  const contact = await prisma.contact.create({
    data: {
      accountId,
      phone,
      phoneNormalized: phone,
      name: contactName ?? null,
    },
  })
  return contact.id
}

/**
 * Keep a single open conversation per contact.
 * Moves messages from extras → keep, then closes extras.
 * Returns the kept conversation id (or null if none open/closed).
 */
export async function mergeOpenConversationsForContact(args: {
  accountId: string
  contactId: string
  keepId?: string | null
}): Promise<string | null> {
  const open = await prisma.conversation.findMany({
    where: {
      accountId: args.accountId,
      contactId: args.contactId,
      status: { not: 'closed' },
    },
    include: { _count: { select: { messages: true } } },
    orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
  })

  if (open.length === 0) return args.keepId ?? null

  let keep =
    (args.keepId ? open.find((c) => c.id === args.keepId) : null) ?? open[0]!

  // Prefer the thread that already has the most history
  for (const c of open) {
    if (c._count.messages > keep._count.messages) keep = c
  }

  for (const d of open) {
    if (d.id === keep.id) continue
    await prisma.message.updateMany({
      where: { conversationId: d.id },
      data: { conversationId: keep.id },
    })
    // Refresh last message preview on keep if dupe was newer
    if (
      d.lastMessageAt &&
      (!keep.lastMessageAt || d.lastMessageAt > keep.lastMessageAt)
    ) {
      await prisma.conversation.update({
        where: { id: keep.id },
        data: {
          lastMessageAt: d.lastMessageAt,
          lastMessageText: d.lastMessageText,
          unreadCount: { increment: d.unreadCount },
        },
      })
    }
    await prisma.conversation.update({
      where: { id: d.id },
      data: { status: 'closed', unreadCount: 0 },
    })
  }

  if (keep.status === 'closed') {
    await prisma.conversation.update({
      where: { id: keep.id },
      data: { status: 'open' },
    })
  }

  return keep.id
}

/**
 * Account-wide cleanup:
 * 1) Merge contacts that are the same phone (exact / fuzzy)
 * 2) Collapse multiple open conversations per contact
 */
export async function dedupeAccountInbox(accountId: string): Promise<{
  contactsMerged: number
  conversationsClosed: number
}> {
  const contactsMerged = await mergeDuplicateContacts(accountId)

  const openRows = await prisma.conversation.findMany({
    where: { accountId, status: { not: 'closed' } },
    select: { id: true, contactId: true },
  })

  const byContact = new Map<string, string[]>()
  for (const row of openRows) {
    const list = byContact.get(row.contactId) ?? []
    list.push(row.id)
    byContact.set(row.contactId, list)
  }

  let conversationsClosed = 0
  for (const [contactId, ids] of byContact) {
    if (ids.length <= 1) continue
    const before = ids.length
    await mergeOpenConversationsForContact({ accountId, contactId })
    conversationsClosed += before - 1
  }

  return { contactsMerged, conversationsClosed }
}

/**
 * Merge contacts that share the same phone (normalized or fuzzy match).
 * Conversations move to the keeper; empty stubs are deleted.
 */
async function mergeDuplicateContacts(accountId: string): Promise<number> {
  const contacts = await prisma.contact.findMany({
    where: { accountId },
    select: {
      id: true,
      phone: true,
      phoneNormalized: true,
      name: true,
      _count: { select: { conversations: true } },
    },
  })

  const used = new Set<string>()
  let merged = 0

  for (let i = 0; i < contacts.length; i++) {
    const a = contacts[i]!
    if (used.has(a.id)) continue

    const group = [a]
    for (let j = i + 1; j < contacts.length; j++) {
      const b = contacts[j]!
      if (used.has(b.id)) continue
      const aPhone = a.phoneNormalized || a.phone
      const bPhone = b.phoneNormalized || b.phone
      if (!aPhone || !bPhone) continue
      if (aPhone === bPhone || phonesMatch(aPhone, bPhone)) {
        group.push(b)
      }
    }

    if (group.length <= 1) continue

    // Keeper: most conversations, then named, then longest phone
    group.sort((x, y) => {
      if (y._count.conversations !== x._count.conversations) {
        return y._count.conversations - x._count.conversations
      }
      const xn = x.name?.trim() ? 1 : 0
      const yn = y.name?.trim() ? 1 : 0
      if (yn !== xn) return yn - xn
      return (y.phone?.length ?? 0) - (x.phone?.length ?? 0)
    })
    const keep = group[0]!

    for (const dupe of group.slice(1)) {
      used.add(dupe.id)
      await prisma.conversation.updateMany({
        where: { contactId: dupe.id, accountId },
        data: { contactId: keep.id },
      })
      if ((!keep.name || !keep.name.trim()) && dupe.name?.trim()) {
        await prisma.contact.update({
          where: { id: keep.id },
          data: { name: dupe.name },
        })
        keep.name = dupe.name
      }
      // Prefer longer / more complete phone on keeper
      const keepPhone = keep.phoneNormalized || keep.phone
      const dupePhone = dupe.phoneNormalized || dupe.phone
      if (
        dupePhone &&
        (!keepPhone || dupePhone.length > keepPhone.length)
      ) {
        await prisma.contact.update({
          where: { id: keep.id },
          data: { phone: dupePhone, phoneNormalized: dupePhone },
        })
        keep.phone = dupePhone
        keep.phoneNormalized = dupePhone
      }
      await prisma.contact.delete({ where: { id: dupe.id } }).catch(() => {})
      merged += 1
    }

    used.add(keep.id)
    await mergeOpenConversationsForContact({
      accountId,
      contactId: keep.id,
    })
  }

  return merged
}
