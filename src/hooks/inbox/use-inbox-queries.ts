'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { useRealtime } from '@/hooks/use-realtime'
import {
  applyConversationPreview,
  applyMessageInsert,
  applyMessageMove,
} from '@/hooks/inbox/apply-realtime'
import {
  type InboxConversation,
  type InboxMessage,
  fetchConversations,
  fetchMessages,
  inboxKeys,
} from '@/hooks/inbox/types'

export function useConversations(enabled = true) {
  return useQuery({
    queryKey: inboxKeys.conversations(),
    queryFn: fetchConversations,
    enabled,
  })
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: inboxKeys.messages(conversationId ?? ''),
    queryFn: () => fetchMessages(conversationId!),
    enabled: Boolean(conversationId),
  })
}

/**
 * Apply Postgres NOTIFY events (via SSE) straight into the query cache.
 * Full inbox invalidation only happens on SSE reconnect.
 */
export function useInboxRealtime(
  accountId: string | null | undefined,
  options: { onConversationMoved?: (from: string, to: string) => void } = {},
): boolean {
  const queryClient = useQueryClient()
  const clientRef = useRef(queryClient)
  clientRef.current = queryClient
  const movedRef = useRef(options.onConversationMoved)
  movedRef.current = options.onConversationMoved

  return useRealtime(accountId, (payload) => {
    const client = clientRef.current

    if (payload.type === 'reconnect') {
      void client.invalidateQueries({ queryKey: inboxKeys.all })
      return
    }

    if (
      payload.table === 'messages' &&
      payload.op === 'INSERT' &&
      payload.id &&
      payload.conversationId
    ) {
      const conversationId = payload.conversationId
      // Only append to threads already loaded; unopened threads fetch the full list on open.
      client.setQueryData<InboxMessage[]>(
        inboxKeys.messages(conversationId),
        (old) => (old ? applyMessageInsert(old, payload) : old),
      )
      let known = true
      client.setQueryData<InboxConversation[]>(
        inboxKeys.conversations(),
        (old) => {
          if (!old) return old
          const result = applyConversationPreview(old, payload)
          known = result.known
          return result.list
        },
      )
      if (!known) {
        void client.invalidateQueries({ queryKey: inboxKeys.conversations() })
      }
      return
    }

    if (
      payload.table === 'messages' &&
      payload.op === 'UPDATE' &&
      payload.movedFromConversationId &&
      payload.movedToConversationId
    ) {
      const from = payload.movedFromConversationId
      const to = payload.movedToConversationId
      for (const id of [from, to]) {
        client.setQueryData<InboxMessage[]>(inboxKeys.messages(id), (old) =>
          old ? applyMessageMove(old, payload, id) : old,
        )
      }
      movedRef.current?.(from, to)
      return
    }

    // Fallbacks for events without bubble fields (ack, send-message, read/avatar/identity).
    if (payload.table === 'conversations') {
      void client.invalidateQueries({ queryKey: inboxKeys.conversations() })
    } else if (payload.table === 'messages') {
      // Refreshes open threads only; does not refetch the conversation list.
      void client.invalidateQueries({ queryKey: [...inboxKeys.all, 'messages'] })
    }
  })
}

