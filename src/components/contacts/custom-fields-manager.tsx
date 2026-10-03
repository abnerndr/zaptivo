'use client'
import { apiFetch } from '@/lib/api/client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type FieldRow = {
  id: string
  field_name: string
  field_type: string
}

const FIELD_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'E-mail' },
] as const

export function CustomFieldsManager() {
  const [fields, setFields] = useState<FieldRow[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [type, setType] = useState('text')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/custom-fields', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Falha ao carregar campos')
      setFields((data.custom_fields as FieldRow[]) ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    if (!name.trim()) {
      toast.error('Nome do campo obrigatório')
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_name: name.trim(),
          field_type: type,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Falha ao criar campo')
      toast.success('Campo criado')
      setName('')
      setType('text')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Excluir este campo? Valores nos contatos serão removidos.')) {
      return
    }
    const res = await apiFetch(`/api/custom-fields/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Falha ao excluir')
      return
    }
    toast.success('Campo excluído')
    void load()
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex h-16 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum campo personalizado ainda.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {fields.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{f.field_name}</p>
                <p className="text-xs text-muted-foreground">{f.field_type}</p>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => void remove(f.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 rounded-lg border border-dashed border-border p-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="cf-name">Nome</Label>
          <Input
            id="cf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex.: CEP"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-type">Tipo</Label>
          <select
            id="cf-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {FIELD_TYPES.map((ft) => (
              <option key={ft.value} value={ft.value}>
                {ft.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" onClick={() => void create()} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Adicionar
        </Button>
      </div>
    </div>
  )
}

export function CustomFieldsPanel() {
  return <CustomFieldsManager />
}

export default CustomFieldsManager
