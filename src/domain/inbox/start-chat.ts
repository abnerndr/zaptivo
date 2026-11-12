import { isLikelyPhoneNumber } from '@/domain/whatsapp/format-phone'

export type InboxStartContact = {
  id: string
  name: string | null
  phone: string
  avatar_url?: string | null
}

type StartConversation = {
  id: string
  last_message_text: string | null
  contact: { id: string; name: string | null; phone: string } | null
}

export function normalizeStartPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`
  }
  if (!isLikelyPhoneNumber(digits)) return null
  return digits
}

function digitsOf(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '')
}

function sameExactPhone(stored: string | null | undefined, normalized: string): boolean {
  const digits = digitsOf(stored)
  if (!digits) return false
  if (digits === normalized) return true
  return normalizeStartPhone(stored ?? '') === normalized
}

function conversationMatches(conversation: StartConversation, query: string): boolean {
  const needle = query.trim().toLowerCase()
  const queryDigits = digitsOf(query)
  const name = conversation.contact?.name?.toLowerCase() ?? ''
  const last = conversation.last_message_text?.toLowerCase() ?? ''
  const phone = digitsOf(conversation.contact?.phone)
  return (
    name.includes(needle) ||
    last.includes(needle) ||
    (queryDigits.length > 0 && phone.includes(queryDigits))
  )
}

export function buildInboxStartResults<
  C extends StartConversation,
  T extends InboxStartContact,
>(args: {
  query: string
  conversations: C[]
  contacts: T[]
}): { conversations: C[]; contacts: T[]; startPhone: string | null } {
  const query = args.query.trim()
  if (!query) {
    return { conversations: args.conversations, contacts: [], startPhone: null }
  }

  const conversations = args.conversations.filter((conversation) =>
    conversationMatches(conversation, query),
  )
  const visibleContactIds = new Set(
    conversations
      .map((conversation) => conversation.contact?.id)
      .filter((id): id is string => Boolean(id)),
  )
  const contacts = args.contacts.filter(
    (contact) => !visibleContactIds.has(contact.id),
  )
  const normalized = normalizeStartPhone(query)
  const taken =
    normalized != null &&
    (args.conversations.some((conversation) =>
      sameExactPhone(conversation.contact?.phone, normalized),
    ) ||
      args.contacts.some((contact) => sameExactPhone(contact.phone, normalized)))

  return {
    conversations,
    contacts,
    startPhone: normalized && !taken ? normalized : null,
  }
}
