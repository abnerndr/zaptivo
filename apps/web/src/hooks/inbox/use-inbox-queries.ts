'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { useRealtime } from '@/hooks/use-realtime'
import {
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

/** Invalidate inbox queries when Postgres NOTIFY arrives via SSE. */
export function useInboxRealtime(accountId: string | null | undefined): boolean {
  const queryClient = useQueryClient()
  const clientRef = useRef(queryClient)
  clientRef.current = queryClient

  return useRealtime(accountId, (payload) => {
    if (payload.table === 'messages' || payload.table === 'conversations') {
      void clientRef.current.invalidateQueries({ queryKey: inboxKeys.all })
    }
  })
}

