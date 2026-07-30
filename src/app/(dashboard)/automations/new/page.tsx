'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Template = {
  slug: string
  name: string
  description: string
  trigger_type: string
}

export default function NewAutomationPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState('first_inbound_message')
  const [keywords, setKeywords] = useState('')
  const [message, setMessage] = useState('Olá! Obrigado pelo contato.')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void fetch('/api/automations/templates')
      .then((r) => r.json())
      .then((d: { templates: Template[] }) => setTemplates(d.templates ?? []))
  }, [])

  const fromTemplate = async (slug: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_slug: slug }),
      })
      if (!res.ok) throw new Error('Falha ao criar')
      const data = (await res.json()) as { automation: { id: string } }
      router.push(`/automations/${data.automation.id}/edit`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  const createManual = async () => {
    if (!name.trim()) {
      toast.error('Nome obrigatório')
      return
    }
    setSaving(true)
    try {
      const trigger_config =
        triggerType === 'keyword_match'
          ? {
              keywords: keywords
                .split(',')
                .map((k) => k.trim())
                .filter(Boolean),
              match_type: 'contains',
            }
          : {}
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          trigger_type: triggerType,
          trigger_config,
          steps: [
            {
              step_type: 'send_message',
              step_config: { text: message },
              position: 0,
            },
          ],
        }),
      })
      if (!res.ok) throw new Error('Falha ao criar')
      const data = (await res.json()) as { automation: { id: string } }
      router.push(`/automations/${data.automation.id}/edit`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-xl font-semibold">Nova automação</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Templates
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.slug}
              type="button"
              disabled={saving}
              onClick={() => void fromTemplate(t.slug)}
              className="rounded-lg border border-border p-3 text-left hover:bg-muted"
            >
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-muted-foreground">
                {t.description}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Manual</h2>
        <div className="space-y-1.5">
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Trigger</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value)}
          >
            <option value="first_inbound_message">Primeira mensagem</option>
            <option value="new_message_received">Nova mensagem</option>
            <option value="keyword_match">Keyword</option>
            <option value="new_contact_created">Novo contato</option>
          </select>
        </div>
        {triggerType === 'keyword_match' ? (
          <div className="space-y-1.5">
            <Label>Keywords (vírgula)</Label>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label>Mensagem</Label>
          <Input value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <Button onClick={() => void createManual()} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Criar
        </Button>
      </section>
    </div>
  )
}
