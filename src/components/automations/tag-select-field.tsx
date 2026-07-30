'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type TagOption = { id: string; name: string; color: string }

type Props = {
  value: string
  onChange: (tagId: string) => void
  label?: string
  /** Optional controlled list — if omitted, loads from /api/tags. */
  tags?: TagOption[]
  onTagsChange?: (tags: TagOption[]) => void
}

/**
 * Select an existing tag or create one inline. Used by automations
 * (add_tag / remove_tag / tag_added trigger) so activation isn't
 * blocked when the account has no tags yet.
 */
export function TagSelectField({
  value,
  onChange,
  label = 'Tag',
  tags: controlledTags,
  onTagsChange,
}: Props) {
  const [localTags, setLocalTags] = useState<TagOption[]>([])
  const [loading, setLoading] = useState(controlledTags === undefined)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const tags = controlledTags ?? localTags

  const setTags = useCallback(
    (next: TagOption[]) => {
      if (controlledTags !== undefined) {
        onTagsChange?.(next)
      } else {
        setLocalTags(next)
      }
    },
    [controlledTags, onTagsChange],
  )

  const load = useCallback(async () => {
    if (controlledTags !== undefined) return
    setLoading(true)
    try {
      const res = await fetch('/api/tags', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Falha ao carregar tags')
      setLocalTags((data.tags as TagOption[]) ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar tags')
    } finally {
      setLoading(false)
    }
  }, [controlledTags])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    const name = newName.trim()
    if (!name) {
      toast.error('Nome da tag obrigatório')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: '#3b82f6' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Falha ao criar tag')
      const created: TagOption = {
        id: data.id as string,
        name: data.name as string,
        color: (data.color as string) ?? '#3b82f6',
      }
      setTags([...tags, created].sort((a, b) => a.name.localeCompare(b.name)))
      onChange(created.id)
      setNewName('')
      setShowCreate(false)
      toast.success(`Tag “${created.name}” criada`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {loading ? (
        <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Carregando tags…
        </div>
      ) : (
        <>
          <select
            className="flex h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={value}
            onChange={(e) => {
              if (e.target.value === '__create__') {
                setShowCreate(true)
                return
              }
              onChange(e.target.value)
            }}
          >
            <option value="">Selecione uma tag…</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="__create__">+ Criar nova tag…</option>
          </select>
          {tags.length === 0 && !showCreate ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Nenhuma tag ainda. Crie uma para poder ativar esta automação.
            </p>
          ) : null}
          {showCreate ? (
            <div className="flex gap-2 pt-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome da nova tag"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void create()
                  }
                }}
                autoFocus
              />
              <Button
                type="button"
                size="sm"
                onClick={() => void create()}
                disabled={creating}
              >
                {creating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Criar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowCreate(false)
                  setNewName('')
                }}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="size-3.5" />
              Nova tag
            </Button>
          )}
        </>
      )}
    </div>
  )
}
