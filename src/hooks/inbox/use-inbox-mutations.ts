'use client'
import { apiFetch } from '@/lib/api/client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  inboxKeys,
  type InboxConversation,
  type InboxMessage,
} from '@/hooks/inbox/types'

export function useSyncWhatsapp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (opts?: {
      light?: boolean
      conversationId?: string
    }) => {
      const params = new URLSearchParams()
      if (opts?.light) params.set('light', '1')
      if (opts?.conversationId) {
        params.set('conversationId', opts.conversationId)
      }
      const qs = params.toString()
      const res = await apiFetch(`/api/whatsapp/sync${qs ? `?${qs}` : ''}`, {
        method: 'POST',
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        messages?: number
        chats?: number
        lidsUpgraded?: number
      }
      if (!res.ok) {
        throw new Error(data.error ?? 'Falha ao sincronizar com o WhatsApp')
      }
      return data
    },
    onSuccess: async (data, vars) => {
      await queryClient.invalidateQueries({ queryKey: inboxKeys.all })
      if (!vars?.light) {
        toast.success(
          `Sincronizado: ${data.chats ?? 0} chats, ${data.messages ?? 0} msgs${
            data.lidsUpgraded
              ? `, ${data.lidsUpgraded} números resolvidos`
              : ''
          }`,
        )
      }
    },
    onError: (err, vars) => {
      if (vars?.light) return
      toast.error(err instanceof Error ? err.message : 'Falha ao sincronizar')
    },
  })
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await apiFetch(`/api/inbox/conversations/${encodeURIComponent(conversationId)}/read`,
        { method: 'POST' },
      )
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(data.error ?? 'Falha ao marcar como lida')
      }
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: inboxKeys.conversations() })
      const prev = queryClient.getQueryData<InboxConversation[]>(
        inboxKeys.conversations(),
      )
      queryClient.setQueryData<InboxConversation[]>(
        inboxKeys.conversations(),
        (list) =>
          list?.map((c) =>
            c.id === conversationId ? { ...c, unread_count: 0 } : c,
          ),
      )
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(inboxKeys.conversations(), ctx.prev)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: inboxKeys.conversations(),
      })
    },
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (args: {
      conversationId: string
      content: string
      tempId: string
    }) => {
      const res = await apiFetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: args.conversationId,
          message_type: 'text',
          content_text: args.content,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        messageId?: string
        contentText?: string | null
        contentType?: string
        createdAt?: string
        status?: string
      }
      if (!res.ok) {
        throw new Error(data.error ?? 'Falha ao enviar')
      }
      return data
    },
    onMutate: async ({ conversationId, content, tempId }) => {
      await queryClient.cancelQueries({
        queryKey: inboxKeys.messages(conversationId),
      })
      const prevMessages = queryClient.getQueryData<InboxMessage[]>(
        inboxKeys.messages(conversationId),
      )
      const optimistic: InboxMessage = {
        id: tempId,
        sender_type: 'agent',
        content_text: content,
        content_type: 'text',
        status: 'sending',
        created_at: new Date().toISOString(),
      }
      queryClient.setQueryData<InboxMessage[]>(
        inboxKeys.messages(conversationId),
        (list) => [...(list ?? []), optimistic],
      )
      queryClient.setQueryData<InboxConversation[]>(
        inboxKeys.conversations(),
        (list) =>
          list?.map((c) =>
            c.id === conversationId
              ? { ...c, last_message_text: content }
              : c,
          ),
      )
      return { prevMessages, conversationId, tempId }
    },
    onSuccess: (data, vars) => {
      queryClient.setQueryData<InboxMessage[]>(
        inboxKeys.messages(vars.conversationId),
        (list) =>
          list?.map((m) =>
            m.id === vars.tempId
              ? {
                  id: data.messageId ?? vars.tempId,
                  sender_type: 'agent',
                  content_text: data.contentText ?? vars.content,
                  content_type: data.contentType ?? 'text',
                  status: data.status ?? 'sent',
                  created_at: data.createdAt ?? new Date().toISOString(),
                }
              : m,
          ),
      )
    },
    onError: (err, vars, ctx) => {
      if (ctx?.prevMessages) {
        queryClient.setQueryData(
          inboxKeys.messages(vars.conversationId),
          ctx.prevMessages,
        )
      } else {
        queryClient.setQueryData<InboxMessage[]>(
          inboxKeys.messages(vars.conversationId),
          (list) => list?.filter((m) => m.id !== vars.tempId),
        )
      }
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar')
    },
    onSettled: (_data, _err, vars) => {
      void queryClient.invalidateQueries({
        queryKey: inboxKeys.messages(vars.conversationId),
      })
      void queryClient.invalidateQueries({
        queryKey: inboxKeys.conversations(),
      })
    },
  })
}
