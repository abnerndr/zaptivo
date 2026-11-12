'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import type { ContactTypeOption } from '@/lib/api/hooks';

export type { ContactTypeOption };

type ContactTypePanelProps = {
  canEdit?: boolean;
  types: ContactTypeOption[];
  creating?: boolean;
  onCreate: (input: { name: string; color: string }) => Promise<unknown>;
  onRemove: (id: string) => void;
};

export function ContactTypePanel({
  canEdit = true,
  types,
  creating = false,
  onCreate,
  onRemove,
}: ContactTypePanelProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#64748b');

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Nome obrigatório');
      return;
    }
    try {
      await onCreate({ name: trimmed, color });
      setName('');
    } catch {
      // O hook já mostra o toast de erro.
    }
  };

  return (
    <section className="flex flex-wrap items-center gap-2">
      <h2 className="text-sm font-semibold">Tipos de lead</h2>

      {types.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum tipo cadastrado.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {types.map((t) => (
            <li
              key={t.id}
              className="border-border flex items-center gap-2 rounded-full border py-1 pr-1 pl-2 text-sm"
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: t.color }}
              />
              {t.name}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="px-2"
                  onClick={() => onRemove(t.id)}
                >
                  Apagar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Input
            className="h-8 w-40"
            placeholder="Nome do tipo"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="color"
            aria-label="Cor do tipo"
            className="border-input h-8 w-10 cursor-pointer rounded-md border bg-transparent p-1"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={creating}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar tipo
          </Button>
        </form>
      )}
    </section>
  );
}

type ContactTypeSelectProps = {
  value: string | null;
  types: ContactTypeOption[];
  disabled?: boolean;
  onAssign: (typeId: string | null) => void;
};

export function ContactTypeSelect({
  value,
  types,
  disabled,
  onAssign,
}: ContactTypeSelectProps) {
  return (
    <select
      aria-label="Tipo de lead"
      className="border-input h-8 rounded-md border bg-transparent px-2 text-sm disabled:opacity-50"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onAssign(e.target.value || null)}
    >
      <option value="">Sem tipo</option>
      {types.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
