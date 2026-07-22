import { prisma } from '@/lib/db/prisma'
import { sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils'

/**
 * Find or create a conversation for an outbound/inbound phone number.
 * Collapses duplicate open conversations for the same contact into one.
 */
export async function resolveConversation(args: {
  accountId: string
  phone: string
  contactName?: string | null
  /** When set, reuse this conversation if it belongs to the contact */
  preferConversationId?: string | null
}): Promise<{ conversationId: string; contactId: string; created: boolean }> {
  const phone = sanitizePhoneForMeta(args.phone)
  const existing = await prisma.contact.findFirst({
    where: {
      accountId: args.accountId,
      OR: [{ phone }, { phoneNormalized: phone }],
    },
  })

  let contactId: string
  let created = false

  if (existing) {
    contactId = existing.id
  } else {
    const contact = await prisma.contact.create({
      data: {
        accountId: args.accountId,
        phone,
        phoneNormalized: phone,
        name: args.contactName ?? null,
      },
    })
    contactId = contact.id
    created = true
  }

  if (args.preferConversationId) {
    const preferred = await prisma.conversation.findFirst({
      where: {
        id: args.preferConversationId,
        accountId: args.accountId,
        contactId,
        status: { not: 'closed' },
      },
    })
    if (preferred) {
      await closeDuplicateConversations({
        accountId: args.accountId,
        contactId,
        keepId: preferred.id,
      })
      return { conversationId: preferred.id, contactId, created }
    }
  }

  const open = await prisma.conversation.findMany({
    where: { accountId: args.accountId, contactId, status: { not: 'closed' } },
    orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    take: 10,
  })

  if (open.length > 0) {
    const keep = open[0]!
    if (open.length > 1) {
      await closeDuplicateConversations({
        accountId: args.accountId,
        contactId,
        keepId: keep.id,
      })
    }
    return { conversationId: keep.id, contactId, created }
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

async function closeDuplicateConversations(args: {
  accountId: string
  contactId: string
  keepId: string
}) {
  const dupes = await prisma.conversation.findMany({
    where: {
      accountId: args.accountId,
      contactId: args.contactId,
      status: { not: 'closed' },
      id: { not: args.keepId },
    },
    select: { id: true },
  })
  if (dupes.length === 0) return

  // Move messages into the kept conversation, then close dupes
  for (const d of dupes) {
    await prisma.message.updateMany({
      where: { conversationId: d.id },
      data: { conversationId: args.keepId },
    })
    await prisma.conversation.update({
      where: { id: d.id },
      data: { status: 'closed' },
    })
  }
}
