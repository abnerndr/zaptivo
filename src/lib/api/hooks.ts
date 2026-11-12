'use client';

import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';

export type ContactTypeOption = { id: string; name: string; color: string };

export type ContactTag = { id: string; name: string; color: string };

export type ContactRow = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  blocked_at?: string | null;
  tags?: ContactTag[];
  type: ContactTypeOption | null;
};

export type ContactsPage = {
  contacts: ContactRow[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type CreateContactInput = {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
};

export const queryKeys = {
  contacts: (params?: Record<string, string>) => ['contacts', params] as const,
  contactTypes: ['contact-types'] as const,
  meSessions: ['me', 'sessions'] as const,
  accountOverview: ['account', 'overview'] as const,
  pipelines: ['pipelines'] as const,
  inboxConversations: (params?: Record<string, string>) =>
    ['inbox', 'conversations', params] as const,
  unreadNotifications: ['notifications', 'unread-count'] as const,
};

function httpStatus(err: unknown): number | undefined {
  if (axios.isAxiosError(err)) return err.response?.status;
  return undefined;
}

export function useContactsQuery(searchParams?: URLSearchParams) {
  const qs = searchParams?.toString() ?? '';
  return useQuery({
    queryKey: queryKeys.contacts(Object.fromEntries(searchParams ?? [])),
    queryFn: async () => {
      try {
        const { data } = await api.get<ContactsPage>(
          `/api/contacts${qs ? `?${qs}` : ''}`
        );
        return data;
      } catch {
        throw new Error('Falha ao carregar');
      }
    },
    placeholderData: keepPreviousData,
  });
}

export function useContactTypesQuery() {
  return useQuery({
    queryKey: queryKeys.contactTypes,
    queryFn: async () => {
      try {
        const { data } = await api.get<{ types: ContactTypeOption[] }>(
          '/api/contact-types'
        );
        return data.types;
      } catch {
        throw new Error('Falha ao carregar tipos');
      }
    },
  });
}

export function useAccountOverviewQuery() {
  return useQuery({
    queryKey: queryKeys.accountOverview,
    queryFn: async () => {
      const { data } = await api.get('/api/account/overview');
      return data;
    },
  });
}

export function usePipelinesQuery() {
  return useQuery({
    queryKey: queryKeys.pipelines,
    queryFn: async () => {
      const { data } = await api.get('/api/pipelines');
      return data;
    },
  });
}

export function useUnreadNotificationsQuery() {
  return useQuery({
    queryKey: queryKeys.unreadNotifications,
    queryFn: async () => {
      const { data } = await api.get('/api/notifications/unread-count');
      return data as { count: number };
    },
    refetchInterval: 30_000,
  });
}

function invalidateContacts(
  qc: ReturnType<typeof useQueryClient>,
  catalog = false
) {
  void qc.invalidateQueries({ queryKey: ['contacts'] });
  if (catalog) {
    void qc.invalidateQueries({ queryKey: ['contact-types'] });
  }
}

export function useCreateContactMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateContactInput) => {
      const { data } = await api.post('/api/contacts', {
        phone: input.phone,
        ...(input.name ? { name: input.name } : {}),
        ...(input.email ? { email: input.email } : {}),
        ...(input.company ? { company: input.company } : {}),
      });
      return data as {
        id: string;
        phone: string;
        name: string | null;
        email: string | null;
        company: string | null;
      };
    },
    onSuccess: () => {
      toast.success('Contato criado');
      invalidateContacts(qc);
    },
    onError: () => {
      toast.error('Falha ao criar');
    },
  });
}

export function useDeleteContactMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/contacts/${id}`);
    },
    onSuccess: () => {
      toast.success('Removido');
      invalidateContacts(qc);
    },
    onError: () => {
      toast.error('Falha ao remover');
    },
  });
}

export function useToggleBlockContactMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; blocked: boolean }) => {
      if (input.blocked) {
        await api.delete(`/api/contacts/${input.id}/block`);
      } else {
        await api.post(`/api/contacts/${input.id}/block`);
      }
      return input;
    },
    onSuccess: (_data, input) => {
      toast.success(
        input.blocked ? 'Contato desbloqueado' : 'Contato na blacklist'
      );
      invalidateContacts(qc);
    },
    onError: (_err, input) => {
      toast.error(input.blocked ? 'Falha ao desbloquear' : 'Falha ao bloquear');
    },
  });
}

export function useAssignContactTypeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contactId: string; typeId: string | null }) => {
      await api.patch(`/api/contacts/${input.contactId}`, {
        typeId: input.typeId,
      });
    },
    onSuccess: () => {
      invalidateContacts(qc);
    },
    onError: () => {
      toast.error('Falha ao atribuir tipo');
    },
  });
}

export function useCreateContactTypeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; color: string }) => {
      try {
        const { data } = await api.post<ContactTypeOption>(
          '/api/contact-types',
          input
        );
        return data;
      } catch (err) {
        if (httpStatus(err) === 409) throw new Error('Tipo já existe');
        throw new Error('Falha ao criar tipo');
      }
    },
    onSuccess: () => {
      toast.success('Tipo criado');
      invalidateContacts(qc, true);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Falha ao criar tipo');
    },
  });
}

export function useDeleteContactTypeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/contact-types/${id}`);
    },
    onSuccess: () => {
      toast.success('Tipo apagado');
      invalidateContacts(qc, true);
    },
    onError: () => {
      toast.error('Falha ao apagar tipo');
    },
  });
}
