'use client'
import { apiFetch } from '@/lib/api/client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type TemplateOption = {
  id: string
  name: string
  language: string
  status: string
}

type ContactType = { id: string; name: string; color?: string | null }

type ContactRow = {
  id: string
  name: string | null
  phone: string
}

type DispatchRow = {
  id: string
  templateId: string
  templateName: string
  status: string
  runAt: string | null
  createdAt: string
  recipientCount: number
}

const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm'

function formatWhen(row: DispatchRow) {
  const iso = row.runAt ?? row.createdAt
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR')
}

export default function AutomationsPage() {
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [types, setTypes] = useState<ContactType[]>([])
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [dispatches, setDispatches] = useState<DispatchRow[]>([])
  const [templateId, setTemplateId] = useState('')
  const [typeId, setTypeId] = useState('')
  const [runAt, setRunAt] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [sending, setSending] = useState(false)

  const loadDispatches = useCallback(async () => {
    const res = await apiFetch('/api/template-dispatches')
    if (!res.ok) throw new Error('Falha ao carregar disparos')
    const data = (await res.json()) as { dispatches: DispatchRow[] }
    setDispatches(data.dispatches)
  }, [])

  const loadContacts = useCallback(async (nextTypeId: string) => {
    setLoadingContacts(true)
    try {
      const qs = new URLSearchParams({ pageSize: '100' })
      if (nextTypeId) qs.set('typeId', nextTypeId)
      const res = await apiFetch(`/api/contacts?${qs.toString()}`)
      if (!res.ok) throw new Error('Falha ao carregar contatos')
      const data = (await res.json()) as { contacts: ContactRow[] }
      setContacts(data.contacts)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoadingContacts(false)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const [tplRes, typesRes] = await Promise.all([
          apiFetch('/api/message-templates'),
          apiFetch('/api/contact-types'),
        ])
        if (!tplRes.ok) throw new Error('Falha ao carregar templates')
        if (!typesRes.ok) throw new Error('Falha ao carregar tipos')
        const tplData = (await tplRes.json()) as { templates: TemplateOption[] }
        const typesData = (await typesRes.json()) as { types: ContactType[] }
        setTemplates(tplData.templates.filter((t) => t.status === 'ACTIVE'))
        setTypes(typesData.types)
        await Promise.all([loadContacts(''), loadDispatches()])
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro')
      } finally {
        setLoading(false)
      }
    })()
  }, [loadContacts, loadDispatches])

  const onTypeChange = (next: string) => {
    setTypeId(next)
    void loadContacts(next)
  }

  const toggleContact = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const markVisible = () => {
    setChecked((prev) => {
      const next = new Set(prev)
      for (const c of contacts) next.add(c.id)
      return next
    })
  }

  const dispatch = async () => {
    if (!templateId) {
      toast.error('Escolha um template')
      return
    }
    if (checked.size === 0) {
      toast.error('Marque ao menos um contato')
      return
    }
    setSending(true)
    try {
      const res = await apiFetch('/api/template-dispatches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          contactIds: [...checked],
          typeId: typeId || null,
          runAt: runAt ? new Date(runAt).toISOString() : null,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Falha ao disparar')
      }
      toast.success(runAt ? 'Disparo agendado' : 'Disparo enviado')
      setChecked(new Set())
      setRunAt('')
      await loadDispatches()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSending(false)
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
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold">Disparo de template</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Template</span>
          <select
            className={selectClass}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">Selecione…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Tipo de contato</span>
          <select
            className={selectClass}
            value={typeId}
            onChange={(e) => onTypeChange(e.target.value)}
          >
            <option value="">Todos os tipos</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Agendar (vazio = agora)</span>
          <input
            type="datetime-local"
            className={selectClass}
            value={runAt}
            onChange={(e) => setRunAt(e.target.value)}
          />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {checked.size} marcado(s) · {contacts.length} visível(is)
          </p>
          <Button variant="outline" size="sm" onClick={markVisible}>
            Marcar visíveis
          </Button>
        </div>
        <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
          {loadingContacts ? (
            <div className="flex h-20 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              Nenhum contato.
            </p>
          ) : (
            contacts.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked.has(c.id)}
                  onChange={() => toggleContact(c.id)}
                />
                <span className="font-medium">{c.name || c.phone}</span>
                {c.name ? (
                  <span className="text-muted-foreground">{c.phone}</span>
                ) : null}
              </label>
            ))
          )}
        </div>
      </div>

      <Button onClick={() => void dispatch()} disabled={sending}>
        {sending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        Disparar
      </Button>

      <div className="space-y-2">
        <h2 className="text-base font-semibold">Disparos</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Horário</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Destinatários</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dispatches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Nenhum disparo.
                </TableCell>
              </TableRow>
            ) : (
              dispatches.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{formatWhen(d)}</TableCell>
                  <TableCell>{d.templateName}</TableCell>
                  <TableCell>{d.status}</TableCell>
                  <TableCell>{d.recipientCount}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
