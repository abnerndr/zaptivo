'use client'
import { apiFetch } from '@/lib/api/client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Template = {
  id: string
  name: string
  language: string
  status: string
}

type Tag = { id: string; name: string; color: string }

export default function NewBroadcastPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateLanguage, setTemplateLanguage] = useState('pt_BR')
  const [templates, setTemplates] = useState<Template[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [mode, setMode] = useState<'all' | 'tags'>('all')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [scheduledAt, setScheduledAt] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void (async () => {
      const [tRes, tagRes] = await Promise.all([
        apiFetch('/api/message-templates'),
        apiFetch('/api/tags'),
      ])
      if (tRes.ok) {
        const data = (await tRes.json()) as { templates: Template[] }
        setTemplates(data.templates)
      }
      if (tagRes.ok) {
        const data = (await tagRes.json()) as { tags: Tag[] }
        setTags(data.tags)
      }
    })()
  }, [])

  const submit = async () => {
    if (!name.trim() || !templateName.trim()) {
      toast.error('Nome e template obrigatórios')
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          template_name: templateName.trim(),
          template_language: templateLanguage,
          audience_filter:
            mode === 'tags'
              ? { mode: 'tags', tagIds }
              : { mode: 'all', tagIds: [] },
          scheduled_at: scheduledAt || null,
        }),
      })
      if (!res.ok) throw new Error('Falha ao criar broadcast')
      const data = (await res.json()) as { broadcast: { id: string } }
      toast.success('Broadcast criado')
      router.push(`/broadcasts/${data.broadcast.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-xl font-semibold">Novo broadcast</h1>
      <div className="space-y-1.5">
        <Label htmlFor="bc-name">Nome</Label>
        <Input
          id="bc-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bc-template">Template</Label>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum template local. Informe o nome manualmente ou crie em
            Settings → WhatsApp.
          </p>
        ) : (
          <select
            id="bc-template"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={templateName}
            onChange={(e) => {
              const t = templates.find((x) => x.name === e.target.value)
              setTemplateName(e.target.value)
              if (t) setTemplateLanguage(t.language)
            }}
          >
            <option value="">Selecione…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>
        )}
        <Input
          placeholder="Ou digite o nome do template"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Audiência</Label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={mode === 'all'}
              onChange={() => setMode('all')}
            />
            Todos os contatos
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={mode === 'tags'}
              onChange={() => setMode('tags')}
            />
            Por tags
          </label>
        </div>
        {mode === 'tags' ? (
          <div className="flex flex-wrap gap-2">
            {tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma tag</p>
            ) : (
              tags.map((t) => {
                const on = tagIds.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setTagIds((prev) =>
                        on ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                      )
                    }
                    className={`rounded-md border px-2 py-1 text-xs ${
                      on ? 'border-primary bg-primary/10' : 'border-border'
                    }`}
                  >
                    {t.name}
                  </button>
                )
              })
            )}
          </div>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bc-schedule">Agendar (opcional)</Label>
        <Input
          id="bc-schedule"
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
      </div>
      <Button onClick={() => void submit()} disabled={saving}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
        Criar draft
      </Button>
    </div>
  )
}
