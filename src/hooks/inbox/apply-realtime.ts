import type { RealtimePayload } from '@/domain/realtime/payload'
import type { InboxConversation, InboxMessage } from '@/hooks/inbox/types'

function toBubble(event: RealtimePayload): InboxMessage {
  return {
    id: event.id as string,
    sender_type: event.direction === 'out' ? 'agent' : 'customer',
    content_text: event.text ?? null,
    content_type: event.contentType ?? 'text',
    status: event.status ?? 'delivered',
    created_at: event.createdAt ?? new Date().toISOString(),
    media_url: event.mediaUrl ?? null,
  }
}

/** Append a realtime message to a thread, idempotent by message id. */
export function applyMessageInsert(
  messages: InboxMessage[] | undefined,
  event: RealtimePayload,
): InboxMessage[] {
  const current = messages ?? []
  if (!event.id || !event.conversationId) return current
  if (current.some((m) => m.id === event.id)) return current
  return [...current, toBubble(event)]
}

/**
 * Update the conversation preview and move it to the top.
 * `known === false` means the conversation is not in the list (caller refetches).
 */
export function applyConversationPreview(
  list: InboxConversation[] | undefined,
  event: RealtimePayload,
): { list: InboxConversation[]; known: boolean } {
  const current = list ?? []
  const index = event.conversationId
    ? current.findIndex((c) => c.id === event.conversationId)
    : -1
  if (index === -1) return { list: current, known: false }

  const target = current[index]
  const updated: InboxConversation = {
    ...target,
    last_message_text: event.text ?? target.last_message_text,
    last_message_at: event.createdAt ?? target.last_message_at,
    unread_count:
      event.direction === 'out' ? target.unread_count : target.unread_count + 1,
  }
  return {
    list: [updated, ...current.filter((_, i) => i !== index)],
    known: true,
  }
}

/** Remove the bubble from the old thread and append it on the new one. */
export function applyMessageMove(
  messages: InboxMessage[] | undefined,
  event: RealtimePayload,
  conversationId: string,
): InboxMessage[] {
  const current = messages ?? []
  const from = event.movedFromConversationId
  const to = event.movedToConversationId
  if (!from || !to || !event.id) return current

  if (conversationId === from) {
    return current.filter((m) => m.id !== event.id)
  }
  if (conversationId === to) {
    if (current.some((m) => m.id === event.id)) return current
    return [...current, toBubble(event)]
  }
  return current
}
