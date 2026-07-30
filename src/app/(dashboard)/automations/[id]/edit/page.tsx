'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Step = {
  step_type: string
  step_config: Record<string, unknown>
  position?: number
}

export default function EditAutomationPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState('')
  const [keywords, setKeywords] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/automations/${params.id}`)
      if (!res.ok) throw new Error('Não encontrado')
      const data = (await res.json()) as {
        automation: {
          name: string
          trigger_type: string
          trigger_config: Record<string, unknown>
          is_active: boolean
          steps: Step[]
        }
      }
      const a = data.automation
      setName(a.name)
      setTriggerType(a.trigger_type)
      setIsActive(a.is_active)
      const k = a.trigger_config?.keywords
      setKeywords(Array.isArray(k) ? (k as string[]).join(', ') : '')
      setSteps(
        (a.steps ?? []).map((s) => ({
          step_type: s.step_type,
          step_config: s.step_config ?? {},
        })),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
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
      const res = await fetch(`/api/automations/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          trigger_type: triggerType,
          trigger_config,
          is_active: isActive,
          steps: steps.map((s, i) => ({ ...s, position: i })),
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          errors?: Array<{ message: string }>
        }
        throw new Error(data.errors?.[0]?.message ?? 'Falha ao salvar')
      }
      toast.success('Salvo')
      router.push('/automations')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-xl font-semibold">Editar automação</h1>
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
          <Label>Keywords</Label>
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Ativa
      </label>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Steps (send_message)</Label>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setSteps((prev) => [
                ...prev,
                { step_type: 'send_message', step_config: { text: '' } },
              ])
            }
          >
            <Plus className="size-3.5" />
            Step
          </Button>
        </div>
        {steps.map((s, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={String(s.step_config.text ?? '')}
              onChange={(e) =>
                setSteps((prev) =>
                  prev.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          step_config: { ...x.step_config, text: e.target.value },
                        }
                      : x,
                  ),
                )
              }
              placeholder="Texto da mensagem"
            />
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.push('/automations')}>
          Cancelar
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Salvar
        </Button>
      </div>
    </div>
  )
}
