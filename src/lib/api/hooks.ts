'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'

export const queryKeys = {
  contacts: (params?: Record<string, string>) =>
    ['contacts', params] as const,
  meSessions: ['me', 'sessions'] as const,
  accountOverview: ['account', 'overview'] as const,
  pipelines: ['pipelines'] as const,
  inboxConversations: (params?: Record<string, string>) =>
    ['inbox', 'conversations', params] as const,
  unreadNotifications: ['notifications', 'unread-count'] as const,
}

export function useContactsQuery(searchParams?: URLSearchParams) {
  const qs = searchParams?.toString() ?? ''
  return useQuery({
    queryKey: queryKeys.contacts(Object.fromEntries(searchParams ?? [])),
    queryFn: async () => {
      const { data } = await api.get(`/api/contacts${qs ? `?${qs}` : ''}`)
      return data as {
        contacts: unknown[]
        totalCount: number
        page: number
        pageSize: number
      }
    },
  })
}

export function useAccountOverviewQuery() {
  return useQuery({
    queryKey: queryKeys.accountOverview,
    queryFn: async () => {
      const { data } = await api.get('/api/account/overview')
      return data
    },
  })
}

export function usePipelinesQuery() {
  return useQuery({
    queryKey: queryKeys.pipelines,
    queryFn: async () => {
      const { data } = await api.get('/api/pipelines')
      return data
    },
  })
}

export function useUnreadNotificationsQuery() {
  return useQuery({
    queryKey: queryKeys.unreadNotifications,
    queryFn: async () => {
      const { data } = await api.get('/api/notifications/unread-count')
      return data as { count: number }
    },
    refetchInterval: 30_000,
  })
}

export function useDeleteContactMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/contacts/${id}`)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contacts'] })
    },
  })
}
