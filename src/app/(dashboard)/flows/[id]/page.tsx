'use client'
import { apiFetch } from '@/lib/api/client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function FlowEditorPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [status, setStatus] = useState('draft')
  const [triggerType, setTriggerType] = useState('keyword')
  const [keywords, setKeywords] = useState('oi')
  const [messages, setMessages] = useState<string[]>(['Olá!'])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/flows/${params.id}`)
      if (!res.ok) throw new Error('Flow não encontrado')
      const data = (await res.json()) as {
        flow: {
          name: string
          status: string
          trigger_type: string
          trigger_config: { keywords?: string[] }
          nodes?: Array<{
            node_type: string
            config: { text?: string }
          }>
        }
      }
      const f = data.flow
      setName(f.name)
      setStatus(f.status)
      setTriggerType(f.trigger_type)
      setKeywords((f.trigger_config?.keywords ?? []).join(', ') || 'oi')
      const texts = (f.nodes ?? [])
        .filter((n) => n.node_type === 'send_message')
        .map((n) => String(n.config.text ?? ''))
      setMessages(texts.length ? texts : ['Olá!'])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    void load()
  }, [load])

  const buildNodes = () => {
    const nodes: Array<{
      node_key: string
      node_type: string
      config: Record<string, unknown>
      position_y: number
    }> = []
    const msgKeys = messages.map((_, i) => `msg_${i + 1}`)
    nodes.push({
      node_key: 'start',
      node_type: 'start',
      config: { next_node_key: msgKeys[0] ?? 'end' },
      position_y: 0,
    })
    messages.forEach((text, i) => {
      nodes.push({
        node_key: msgKeys[i]!,
        node_type: 'send_message',
        config: {
          text,
          next_node_key: msgKeys[i + 1] ?? 'end',
        },
        position_y: (i + 1) * 80,
      })
    })
    nodes.push({
      node_key: 'end',
      node_type: 'end',
      config: {},
      position_y: (messages.length + 1) * 80,
    })
    return nodes
  }

  const save = async () => {
    setSaving(true)
    try {
      const nodes = buildNodes()
      const res = await apiFetch(`/api/flows/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          trigger_type: triggerType,
          trigger_config:
            triggerType === 'keyword'
              ? {
                  keywords: keywords
                    .split(',')
                    .map((k) => k.trim())
                    .filter(Boolean),
                  match_type: 'contains',
                }
              : {},
          entry_node_id: 'start',
          nodes,
        }),
      })
      if (!res.ok) throw new Error('Falha ao salvar')
      toast.success('Salvo')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  const activate = async (active: boolean) => {
    await save()
    const res = await apiFetch(`/api/flows/${params.id}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        errors?: Array<{ message: string }>
      }
      toast.error(data.errors?.[0]?.message ?? 'Falha ao ativar')
      return
    }
    toast.success(active ? 'Ativado' : 'Desativado')
    void load()
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
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Editar flow</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/flows/${params.id}/runs`)}
          >
            Runs
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push('/flows')}
          >
            Voltar
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Status: {status}</p>
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
          <option value="keyword">Keyword</option>
          <option value="first_inbound_message">Primeira mensagem</option>
        </select>
      </div>
      {triggerType === 'keyword' ? (
        <div className="space-y-1.5">
          <Label>Keywords (vírgula)</Label>
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
        </div>
      ) : null}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Mensagens</Label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMessages((m) => [...m, ''])}
          >
            <Plus className="size-3.5" />
            Mensagem
          </Button>
        </div>
        {messages.map((text, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={text}
              onChange={(e) =>
                setMessages((prev) =>
                  prev.map((x, j) => (j === i ? e.target.value : x)),
                )
              }
            />
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() =>
                setMessages((prev) => prev.filter((_, j) => j !== i))
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Salvar
        </Button>
        <Button variant="secondary" onClick={() => void activate(true)}>
          Ativar
        </Button>
        <Button variant="outline" onClick={() => void activate(false)}>
          Desativar
        </Button>
      </div>
    </div>
  )
}
