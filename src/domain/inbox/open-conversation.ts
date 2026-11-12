import { prisma } from '@/domain/db/prisma'
import { normalizeStartPhone } from '@/domain/inbox/start-chat'
import { sanitizePhoneForMeta } from '@/domain/whatsapp/phone-utils'
import { resolveConversation } from '@/domain/whatsapp/resolve-conversation'

export class InboxConversationError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'InboxConversationError'
    this.status = status
  }
}

export type OpenedInboxConversation = {
  id: string
  status: string
  unread_count: number
  last_message_text: string | null
  last_message_at: string | null
  assigned_agent_id: string | null
  contact: {
    id: string
    name: string | null
    phone: string
    avatar_url: string | null
  } | null
  created: boolean
}

export async function openInboxConversation(args: {
  accountId: string
  contactId?: string | null
  phone?: string | null
}): Promise<OpenedInboxConversation> {
  const contactId = args.contactId?.trim() ?? ''
  const rawPhone = args.phone?.trim() ?? ''
  if (Boolean(contactId) === Boolean(rawPhone)) {
    throw new InboxConversationError('Informe contactId ou phone', 400)
  }

  let phone: string
  if (contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, accountId: args.accountId },
    })
    if (!contact) {
      throw new InboxConversationError('Contato não encontrado', 404)
    }
    if (contact.blockedAt) {
      throw new InboxConversationError('Contato na blacklist', 403)
    }
    phone = sanitizePhoneForMeta(contact.phone)
    if (!phone) {
      throw new InboxConversationError('Telefone inválido', 400)
    }
  } else {
    const normalized = normalizeStartPhone(rawPhone)
    if (!normalized) {
      throw new InboxConversationError('Telefone inválido', 400)
    }
    const blocked = await prisma.contact.findFirst({
      where: {
        accountId: args.accountId,
        blockedAt: { not: null },
        OR: [{ phone: normalized }, { phoneNormalized: normalized }],
      },
    })
    if (blocked) {
      throw new InboxConversationError('Contato na blacklist', 403)
    }
    phone = normalized
  }

  const resolved = await resolveConversation({
    accountId: args.accountId,
    phone,
  })

  const conversation = await prisma.conversation.findFirst({
    where: { id: resolved.conversationId, accountId: args.accountId },
    include: { contact: true },
  })
  if (!conversation) {
    throw new InboxConversationError('Conversa não encontrada', 404)
  }

  return {
    id: conversation.id,
    status: conversation.status,
    unread_count: conversation.unreadCount,
    last_message_text: conversation.lastMessageText,
    last_message_at: conversation.lastMessageAt?.toISOString() ?? null,
    assigned_agent_id: conversation.assignedAgentId,
    contact: conversation.contact
      ? {
          id: conversation.contact.id,
          name: conversation.contact.name,
          phone: conversation.contact.phone,
          avatar_url: conversation.contact.avatarUrl,
        }
      : null,
    created: resolved.created,
  }
}
