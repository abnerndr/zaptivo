import { apiFetch } from '@/lib/api/client'
import type { MessageStatus } from '@/types'

export const inboxKeys = {
  all: ['inbox'] as const,
  conversations: () => [...inboxKeys.all, 'conversations'] as const,
  messages: (conversationId: string) =>
    [...inboxKeys.all, 'messages', conversationId] as const,
}

export type InboxContact = {
  id: string
  name: string | null
  phone: string
  avatar_url: string | null
}

export type InboxConversation = {
  id: string
  last_message_text: string | null
  last_message_at?: string | null
  unread_count: number
  contact: InboxContact | null
}

export type InboxMessage = {
  id: string
  sender_type: string
  content_text: string | null
  content_type: string
  status: MessageStatus | string
  created_at: string
  message_id?: string | null
}

export async function fetchConversations(): Promise<InboxConversation[]> {
  const res = await apiFetch('/api/inbox/conversations', { cache: 'no-store' })
  if (!res.ok) throw new Error('Falha ao carregar conversas')
  const data = (await res.json()) as { conversations: InboxConversation[] }
  return data.conversations ?? []
}

export async function fetchMessages(
  conversationId: string,
): Promise<InboxMessage[]> {
  const res = await apiFetch(`/api/inbox/messages?conversationId=${encodeURIComponent(conversationId)}`,
    { cache: 'no-store' },
  )
  if (!res.ok) throw new Error('Falha ao carregar mensagens')
  const data = (await res.json()) as { messages?: InboxMessage[] }
  return data.messages ?? []
}
