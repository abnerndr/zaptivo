import { prisma } from '@/domain/db/prisma'
import { notifyAccount } from '@/domain/db/notify'

/**
 * Create an in-app notification when a conversation is assigned.
 * Skips self-assignment. Never throws — assignment must not fail
 * because of notification side-effects.
 */
export async function notifyConversationAssigned(input: {
  accountId: string
  conversationId: string
  contactId: string
  assigneeUserId: string
  actorUserId: string | null
}): Promise<void> {
  try {
    if (
      input.actorUserId &&
      input.actorUserId === input.assigneeUserId
    ) {
      return
    }

    const [contact, actor] = await Promise.all([
      prisma.contact.findFirst({
        where: { id: input.contactId, accountId: input.accountId },
        select: { name: true, phone: true },
      }),
      input.actorUserId
        ? prisma.profile.findUnique({
            where: { userId: input.actorUserId },
            select: { fullName: true },
          })
        : Promise.resolve(null),
    ])

    const contactLabel =
      contact?.name?.trim() || contact?.phone || 'um contato'
    const actorLabel = actor?.fullName?.trim() || 'Alguém'

    const row = await prisma.notification.create({
      data: {
        accountId: input.accountId,
        userId: input.assigneeUserId,
        type: 'conversation_assigned',
        conversationId: input.conversationId,
        contactId: input.contactId,
        actorUserId: input.actorUserId,
        title: 'Nova conversa atribuída',
        body: `${actorLabel} atribuiu a você uma conversa com ${contactLabel}`,
      },
    })

    await notifyAccount({
      table: 'notifications',
      op: 'INSERT',
      id: row.id,
      accountId: input.accountId,
    }).catch(() => {})
  } catch (err) {
    console.warn('[notifyConversationAssigned]', err)
  }
}
