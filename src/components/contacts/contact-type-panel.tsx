'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus } from 'lucide-react'

export type ContactTypeOption = { id: string; name: string; color: string }

type ContactTypePanelProps = {
  canEdit?: boolean
  /** Chamado depois de criar ou apagar um tipo. */
  onChange?: () => void
  /** Chamado sempre que o catálogo é (re)carregado. */
  onTypesLoaded?: (types: ContactTypeOption[]) => void
}

export function ContactTypePanel({
  canEdit = true,
  onChange,
  onTypesLoaded,
}: ContactTypePanelProps) {
  const [types, setTypes] = useState<ContactTypeOption[]>([])
  const [name, setName] = useState('')
  const [color, setColor] = useState('#64748b')

  const loadTypes = useCallback(async () => {
    try {
      const res = await apiFetch('/api/contact-types')
      if (!res.ok) throw new Error('Falha ao carregar tipos')
      const data = (await res.json()) as { types: ContactTypeOption[] }
      setTypes(data.types)
      onTypesLoaded?.(data.types)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    }
  }, [onTypesLoaded])

  useEffect(() => {
    void loadTypes()
  }, [loadTypes])

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Nome obrigatório')
      return
    }
    const res = await apiFetch('/api/contact-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, color }),
    })
    if (res.status === 409) {
      toast.error('Tipo já existe')
      return
    }
    if (!res.ok) {
      toast.error('Falha ao criar tipo')
      return
    }
    setName('')
    toast.success('Tipo criado')
    await loadTypes()
    onChange?.()
  }

  const remove = async (id: string) => {
    const res = await apiFetch(`/api/contact-types/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Falha ao apagar tipo')
      return
    }
    toast.success('Tipo apagado')
    await loadTypes()
    onChange?.()
  }

  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <h2 className="text-sm font-semibold">Tipos de lead</h2>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs"
            placeholder="Nome do tipo"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="color"
            aria-label="Cor do tipo"
            className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <Button onClick={() => void create()}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar tipo
          </Button>
        </div>
      )}

      {types.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum tipo cadastrado.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {types.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-full border border-border py-1 pl-2 pr-1 text-sm"
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: t.color }}
              />
              {t.name}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => void remove(t.id)}
                >
                  Apagar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type ContactTypeSelectProps = {
  contactId: string
  value: string | null
  types: ContactTypeOption[]
  disabled?: boolean
  onChange?: () => void
}

export function ContactTypeSelect({
  contactId,
  value,
  types,
  disabled,
  onChange,
}: ContactTypeSelectProps) {
  const handleChange = async (next: string) => {
    const res = await apiFetch(`/api/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typeId: next || null }),
    })
    if (!res.ok) {
      toast.error('Falha ao atribuir tipo')
      return
    }
    onChange?.()
  }

  return (
    <select
      aria-label="Tipo de lead"
      className="h-8 rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-50"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => void handleChange(e.target.value)}
    >
      <option value="">Sem tipo</option>
      {types.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}
