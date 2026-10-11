import type { InboxMessage } from './types'

export function confirmOptimisticMessage(
  list: InboxMessage[] | undefined,
  tempId: string,
  confirmed: {
    id: string
    contentText: string | null
    contentType: string
    status: string
    createdAt: string
  },
): InboxMessage[] | undefined {
  if (!list) return list
  return list.map((m) =>
    m.id === tempId
      ? {
          ...m,
          id: confirmed.id,
          sender_type: 'agent',
          content_text: confirmed.contentText,
          content_type: confirmed.contentType,
          status: confirmed.status,
          created_at: confirmed.createdAt,
        }
      : m,
  )
}
