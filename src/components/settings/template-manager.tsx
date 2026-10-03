'use client'
import { apiFetch } from '@/lib/api/client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SettingsPanelHead } from './settings-panel-head'

type TemplateRow = {
  id: string
  name: string
  language: string
  category: string
  body_text: string
  footer_text: string | null
  status: string
  updated_at?: string
}

type Draft = {
  id?: string
  name: string
  language: string
  category: string
  body_text: string
  footer_text: string
  status: string
}

function emptyDraft(): Draft {
  return {
    name: '',
    language: 'pt_BR',
    category: 'Marketing',
    body_text: '',
    footer_text: '',
    status: 'DRAFT',
  }
}

function normalizeTemplate(raw: Record<string, unknown>): TemplateRow {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    language: String(raw.language ?? 'pt_BR'),
    category: String(raw.category ?? 'Marketing'),
    body_text: String(raw.body_text ?? raw.bodyText ?? ''),
    footer_text:
      (raw.footer_text as string | null | undefined) ??
      (raw.footerText as string | null | undefined) ??
      null,
    status: String(raw.status ?? 'DRAFT'),
    updated_at:
      typeof raw.updated_at === 'string'
        ? raw.updated_at
        : raw.updatedAt instanceof Date
          ? raw.updatedAt.toISOString()
          : typeof raw.updatedAt === 'string'
            ? raw.updatedAt
            : undefined,
  }
}

export function TemplateManager() {
  const [items, setItems] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/message-templates', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Falha ao carregar templates')
      const rows = (data.templates as Record<string, unknown>[] | undefined) ?? []
      setItems(rows.map(normalizeTemplate))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => setDraft(emptyDraft())
  const openEdit = (t: TemplateRow) =>
    setDraft({
      id: t.id,
      name: t.name,
      language: t.language,
      category: t.category,
      body_text: t.body_text,
      footer_text: t.footer_text ?? '',
      status: t.status,
    })

  const save = async () => {
    if (!draft) return
    if (!draft.name.trim() || !draft.body_text.trim()) {
      toast.error('Nome e corpo da mensagem são obrigatórios')
      return
    }
    setSaving(true)
    try {
      if (draft.id) {
        const res = await apiFetch(`/api/whatsapp/templates/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name.trim(),
            language: draft.language,
            body_text: draft.body_text,
            footer_text: draft.footer_text.trim() || null,
            status: draft.status,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? 'Falha ao atualizar')
        }
      } else {
        const res = await apiFetch('/api/whatsapp/templates/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name.trim(),
            language: draft.language,
            category: draft.category,
            body_text: draft.body_text,
            footer_text: draft.footer_text.trim() || undefined,
            status: draft.status,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? 'Falha ao criar')
        }
      }
      toast.success(draft.id ? 'Template atualizado' : 'Template criado')
      setDraft(null)
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Apagar este template?')) return
    const res = await apiFetch(`/api/whatsapp/templates/${id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      toast.error('Falha ao apagar')
      return
    }
    toast.success('Template apagado')
    void load()
  }

  return (
    <div>
      <SettingsPanelHead
        title="Templates"
        description="Templates locais de mensagem (WAHA). Sem sincronização Meta."
        action={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Novo template
          </Button>
        }
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum template ainda. Crie o primeiro para usar em broadcasts.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{t.name}</span>
                  <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {t.language}
                  </span>
                  <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {t.status}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {t.body_text}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => openEdit(t)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void remove(t.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) setDraft(null)
        }}
      >
        <DialogContent className="bg-popover border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? 'Editar template' : 'Novo template'}
            </DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Nome</Label>
                <Input
                  id="tpl-name"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft({ ...draft, name: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-lang">Idioma</Label>
                  <Input
                    id="tpl-lang"
                    value={draft.language}
                    onChange={(e) =>
                      setDraft({ ...draft, language: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-status">Status</Label>
                  <select
                    id="tpl-status"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={draft.status}
                    onChange={(e) =>
                      setDraft({ ...draft, status: e.target.value })
                    }
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-body">Corpo</Label>
                <Textarea
                  id="tpl-body"
                  rows={5}
                  value={draft.body_text}
                  onChange={(e) =>
                    setDraft({ ...draft, body_text: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-footer">Rodapé (opcional)</Label>
                <Input
                  id="tpl-footer"
                  value={draft.footer_text}
                  onChange={(e) =>
                    setDraft({ ...draft, footer_text: e.target.value })
                  }
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
