'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useCreateContactMutation,
  useUpdateContactMutation,
  type ContactRow,
} from '@/lib/api/hooks';

type CreateContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: ContactRow | null;
};

export function CreateContactDialog({
  open,
  onOpenChange,
  contact = null,
}: CreateContactDialogProps) {
  const editing = contact != null;
  const create = useCreateContactMutation();
  const update = useUpdateContactMutation();
  const pending = create.isPending || update.isPending;
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [name, setName] = useState(contact?.name ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [company, setCompany] = useState(contact?.company ?? '');

  const reset = () => {
    setPhone(contact?.phone ?? '');
    setName(contact?.name ?? '');
    setEmail(contact?.email ?? '');
    setCompany(contact?.company ?? '');
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async () => {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName && !editing && !trimmedPhone) {
      toast.error('Nome e telefone são obrigatórios');
      return;
    }
    if (!trimmedName) {
      toast.error('Nome obrigatório');
      return;
    }
    if (!editing && !trimmedPhone) {
      toast.error('Telefone obrigatório');
      return;
    }

    const emailValue = email.trim() || null;
    const companyValue = company.trim() || null;

    try {
      if (editing && contact) {
        await update.mutateAsync({
          id: contact.id,
          name: trimmedName,
          email: emailValue,
          company: companyValue,
        });
      } else {
        await create.mutateAsync({
          phone: trimmedPhone,
          name: trimmedName,
          email: emailValue ?? undefined,
          company: companyValue ?? undefined,
        });
      }
      onOpenChange(false);
    } catch {
      // O hook já mostra o toast de erro.
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Editar contato' : 'Novo contato'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'O telefone não pode ser alterado. Nome é obrigatório.'
              : 'Nome e telefone são obrigatórios. E-mail e empresa são opcionais.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="contact-name">Nome</Label>
            <Input
              id="contact-name"
              placeholder="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="contact-phone">Telefone</Label>
            <Input
              id="contact-phone"
              placeholder="5511999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              required={!editing}
              disabled={editing}
              readOnly={editing}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="contact-email">E-mail</Label>
            <Input
              id="contact-email"
              type="email"
              placeholder="email@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="contact-company">Empresa</Label>
            <Input
              id="contact-company"
              placeholder="Empresa"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              autoComplete="organization"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
