'use client'
import { apiFetch } from '@/lib/api/client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TagSelectField } from '@/components/automations/tag-select-field'

type Step = {
  step_type: string
  step_config: Record<string, unknown>
  position?: number
}

const STEP_LABELS: Record<string, string> = {
  send_message: 'Enviar mensagem',
  add_tag: 'Adicionar tag',
  remove_tag: 'Remover tag',
  wait: 'Aguardar',
  assign_conversation: 'Atribuir conversa',
  condition: 'Condição',
  send_template: 'Enviar template',
  create_deal: 'Criar deal',
  update_contact_field: 'Atualizar campo',
  send_webhook: 'Webhook',
  close_conversation: 'Fechar conversa',
  send_buttons: 'Botões',
  send_list: 'Lista',
}

export default function EditAutomationPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState('')
  const [keywords, setKeywords] = useState('')
  const [triggerTagId, setTriggerTagId] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/automations/${params.id}`)
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
      setTriggerTagId(
        typeof a.trigger_config?.tag_id === 'string'
          ? a.trigger_config.tag_id
          : '',
      )
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

  const updateStepConfig = (index: number, patch: Record<string, unknown>) => {
    setSteps((prev) =>
      prev.map((x, j) =>
        j === index
          ? { ...x, step_config: { ...x.step_config, ...patch } }
          : x,
      ),
    )
  }

  const save = async () => {
    setSaving(true)
    try {
      let trigger_config: Record<string, unknown> = {}
      if (triggerType === 'keyword_match') {
        trigger_config = {
          keywords: keywords
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
          match_type: 'contains',
        }
      } else if (triggerType === 'tag_added') {
        trigger_config = { tag_id: triggerTagId }
      }

      const res = await apiFetch(`/api/automations/${params.id}`, {
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
          errors?: Array<{ path?: string; message: string }>
          error?: string
        }
        const first = data.errors?.[0]
        const msg = first
          ? first.path
            ? `${first.message} (${first.path})`
            : first.message
          : (data.error ?? 'Falha ao salvar')
        throw new Error(msg)
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
          className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground"
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value)}
        >
          <option value="first_inbound_message">Primeira mensagem</option>
          <option value="new_message_received">Nova mensagem</option>
          <option value="keyword_match">Keyword</option>
          <option value="new_contact_created">Novo contato</option>
          <option value="tag_added">Tag adicionada</option>
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
      {triggerType === 'tag_added' ? (
        <TagSelectField
          label="Tag do trigger"
          value={triggerTagId}
          onChange={setTriggerTagId}
        />
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Ativa
      </label>
      {isActive ? (
        <p className="text-xs text-muted-foreground">
          Para ativar, steps como “Adicionar tag” precisam de uma tag
          selecionada.
        </p>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Steps</Label>
          <div className="flex gap-1">
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
              Mensagem
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setSteps((prev) => [
                  ...prev,
                  { step_type: 'add_tag', step_config: { tag_id: '' } },
                ])
              }
            >
              <Plus className="size-3.5" />
              Tag
            </Button>
          </div>
        </div>

        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum step.</p>
        ) : (
          steps.map((s, i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {i + 1}. {STEP_LABELS[s.step_type] ?? s.step_type}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() =>
                    setSteps((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              {s.step_type === 'send_message' ? (
                <Input
                  value={String(s.step_config.text ?? '')}
                  onChange={(e) =>
                    updateStepConfig(i, { text: e.target.value })
                  }
                  placeholder="Texto da mensagem"
                />
              ) : null}

              {s.step_type === 'add_tag' || s.step_type === 'remove_tag' ? (
                <TagSelectField
                  value={String(s.step_config.tag_id ?? '')}
                  onChange={(tagId) => updateStepConfig(i, { tag_id: tagId })}
                />
              ) : null}

              {s.step_type === 'wait' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={Number(s.step_config.amount ?? 1)}
                    onChange={(e) =>
                      updateStepConfig(i, {
                        amount: Number(e.target.value) || 1,
                      })
                    }
                  />
                  <select
                    className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground"
                    value={String(s.step_config.unit ?? 'minutes')}
                    onChange={(e) =>
                      updateStepConfig(i, { unit: e.target.value })
                    }
                  >
                    <option value="minutes">minutos</option>
                    <option value="hours">horas</option>
                    <option value="days">dias</option>
                  </select>
                </div>
              ) : null}

              {!['send_message', 'add_tag', 'remove_tag', 'wait'].includes(
                s.step_type,
              ) ? (
                <p className="text-xs text-muted-foreground">
                  Configuração avançada deste step ainda não está no editor
                  enxuto. Remova o step ou complete via API se necessário.
                </p>
              ) : null}
            </div>
          ))
        )}
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
