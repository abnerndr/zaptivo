'use client';

import { Button } from '@/components/ui/button';
import type { ContactTypeOption } from '@/lib/api/hooks';

type ContactTypeFilterProps = {
  types: ContactTypeOption[];
  value: string | null;
  onChange: (next: string | null) => void;
};

export function ContactTypeFilter({
  types,
  value,
  onChange,
}: ContactTypeFilterProps) {
  const choose = (next: string) => {
    onChange(value === next ? null : next);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Filtrar por tipo"
    >
      <span className="text-sm font-medium">Tipo</span>
      <Button
        type="button"
        size="sm"
        variant={value == null ? 'secondary' : 'outline'}
        aria-pressed={value == null}
        onClick={() => onChange(null)}
      >
        Todos
      </Button>
      {types.map((type) => {
        const active = value === type.id;
        return (
          <Button
            key={type.id}
            type="button"
            size="sm"
            variant={active ? 'secondary' : 'outline'}
            aria-pressed={active}
            onClick={() => choose(type.id)}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: type.color }}
            />
            {type.name}
          </Button>
        );
      })}
      <Button
        type="button"
        size="sm"
        variant={value === 'none' ? 'secondary' : 'outline'}
        aria-pressed={value === 'none'}
        onClick={() => choose('none')}
      >
        Sem tipo
      </Button>
    </div>
  );
}
