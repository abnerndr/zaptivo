'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCan } from '@/hooks/use-can';
import {
  ContactTypePanel,
  ContactTypeSelect,
} from '@/components/contacts/contact-type-panel';
import { CreateContactDialog } from '@/components/contacts/create-contact-dialog';
import {
  useAssignContactTypeMutation,
  useContactTypesQuery,
  useContactsQuery,
  useCreateContactTypeMutation,
  useDeleteContactMutation,
  useDeleteContactTypeMutation,
  useToggleBlockContactMutation,
} from '@/lib/api/hooks';

const PAGE_SIZE = 25;

export default function ContactsPage() {
  const canEdit = useCan('send-messages');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const params = useMemo(() => {
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    const q = deferredSearch.trim();
    if (q) qs.set('q', q);
    return qs;
  }, [page, deferredSearch]);

  const contactsQuery = useContactsQuery(params);
  const typesQuery = useContactTypesQuery();
  const remove = useDeleteContactMutation();
  const toggleBlock = useToggleBlockContactMutation();
  const createType = useCreateContactTypeMutation();
  const deleteType = useDeleteContactTypeMutation();
  const assignType = useAssignContactTypeMutation();

  const contacts = contactsQuery.data?.contacts ?? [];
  const totalCount = contactsQuery.data?.totalCount ?? 0;
  const types = typesQuery.data ?? [];

  useEffect(() => {
    if (!contactsQuery.isError) return;
    toast.error(
      contactsQuery.error instanceof Error
        ? contactsQuery.error.message
        : 'Erro'
    );
  }, [
    contactsQuery.isError,
    contactsQuery.error,
    contactsQuery.errorUpdatedAt,
  ]);

  useEffect(() => {
    if (!typesQuery.isError) return;
    toast.error(
      typesQuery.error instanceof Error ? typesQuery.error.message : 'Erro'
    );
  }, [typesQuery.isError, typesQuery.error, typesQuery.errorUpdatedAt]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold">Contatos</h1>
          {contactsQuery.data ? (
            <span className="text-muted-foreground text-sm">
              {totalCount} total
            </span>
          ) : null}
        </div>
        {canEdit && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Novo contato
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
        <Input
          className="pl-8"
          placeholder="Buscar nome, telefone ou e-mail"
          value={search}
          onChange={(e) => {
            setPage(0);
            setSearch(e.target.value);
          }}
        />
      </div>

      {typesQuery.isPending ? (
        <p className="text-muted-foreground text-sm">Carregando tipos…</p>
      ) : typesQuery.isError ? (
        <p className="text-muted-foreground text-sm">Falha ao carregar tipos</p>
      ) : (
        <ContactTypePanel
          canEdit={canEdit}
          types={types}
          creating={createType.isPending}
          onCreate={(input) => createType.mutateAsync(input)}
          onRemove={(id) => deleteType.mutate(id)}
        />
      )}

      {contactsQuery.isPending ? (
        <div className="text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : contactsQuery.isError ? (
        <p className="text-muted-foreground text-sm">Falha ao carregar</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Nenhum contato encontrado.
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      {c.name || '—'}
                      {c.blocked_at ? (
                        <Badge variant="destructive">Bloqueado</Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell>{c.phone}</TableCell>
                  <TableCell>{c.email || '—'}</TableCell>
                  <TableCell>
                    <ContactTypeSelect
                      value={c.type?.id ?? null}
                      types={types}
                      disabled={!canEdit || assignType.isPending}
                      onAssign={(typeId) =>
                        assignType.mutate({ contactId: c.id, typeId })
                      }
                    />
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    {canEdit && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            toggleBlock.mutate({
                              id: c.id,
                              blocked: Boolean(c.blocked_at),
                            })
                          }
                        >
                          {c.blocked_at ? 'Desbloquear' : 'Blacklist'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove.mutate(c.id)}
                        >
                          Remover
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={page === 0 || contactsQuery.isPending}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          disabled={
            (page + 1) * PAGE_SIZE >= totalCount || contactsQuery.isPending
          }
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>

      {canEdit && (
        <CreateContactDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
    </div>
  );
}
