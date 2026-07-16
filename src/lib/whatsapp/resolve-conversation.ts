import { prisma } from '@/lib/db/prisma'
import { sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils'

/**
 * Find or create a conversation for an outbound/inbound phone number.
 */
export async function resolveConversation(args: {
  accountId: string
  phone: string
  contactName?: string | null
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

  const conversation = await prisma.conversation.findFirst({
    where: { accountId: args.accountId, contactId, status: { not: 'closed' } },
    orderBy: { updatedAt: 'desc' },
  })

  if (conversation) {
    return { conversationId: conversation.id, contactId, created }
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
