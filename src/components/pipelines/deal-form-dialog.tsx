'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, Loader2 } from 'lucide-react'
import type { Deal } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CURRENCIES } from '@/lib/currency'

type ContactOption = {
  id: string
  name: string | null
  phone: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipelineId: string
  stageId: string | null
  deal?: Deal | null
  onSaved: () => void
}

function contactLabel(c: ContactOption) {
  if (c.name?.trim()) return `${c.name.trim()} — ${c.phone}`
  return c.phone
}

export function DealFormDialog({
  open,
  onOpenChange,
  pipelineId,
  stageId,
  deal,
  onSaved,
}: Props) {
  const editing = Boolean(deal)
  const [title, setTitle] = useState('')
  const [value, setValue] = useState('0')
  const [currency, setCurrency] = useState('BRL')
  const [notes, setNotes] = useState('')
  const [contactId, setContactId] = useState('')
  const [contactQ, setContactQ] = useState('')
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(false)

  const seedContact = useMemo<ContactOption | null>(() => {
    if (!deal?.contact_id) return null
    return {
      id: deal.contact_id,
      name: deal.contact?.name ?? null,
      phone: deal.contact?.phone ?? '',
    }
  }, [deal])

  useEffect(() => {
    if (!open) return
    setTitle(deal?.title ?? '')
    setValue(String(deal?.value ?? 0))
    setCurrency(deal?.currency ?? 'BRL')
    setNotes(deal?.notes ?? '')
    setContactId(deal?.contact_id ?? '')
    setContactQ('')
  }, [open, deal])

  const loadContacts = useCallback(
    async (q: string) => {
      setLoadingContacts(true)
      try {
        const qs = new URLSearchParams({ pageSize: '50', ...(q ? { q } : {}) })
        const res = await fetch(`/api/contacts?${qs}`)
        if (!res.ok) throw new Error('Falha ao buscar contatos')
        const data = (await res.json()) as { contacts: ContactOption[] }
        const rows = data.contacts ?? []
        // Keep the deal's current contact in the options even if the
        // search page wouldn't include it.
        if (seedContact && !rows.some((c) => c.id === seedContact.id)) {
          setContacts([seedContact, ...rows])
        } else {
          setContacts(rows)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro')
      } finally {
        setLoadingContacts(false)
      }
    },
    [seedContact],
  )

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => void loadContacts(contactQ), 200)
    return () => clearTimeout(t)
  }, [open, contactQ, loadContacts])

  const selected = contacts.find((c) => c.id === contactId) ?? seedContact

  const save = async () => {
    if (!title.trim()) {
      toast.error('Título obrigatório')
      return
    }
    if (!editing && !contactId) {
      toast.error('Contato obrigatório')
      return
    }
    if (!editing && !stageId) {
      toast.error('Stage inválido')
      return
    }
    setSaving(true)
    try {
      if (editing && deal) {
        const res = await fetch(`/api/deals/${deal.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            value: Number(value) || 0,
            currency,
            notes: notes || null,
            ...(contactId ? { contact_id: contactId } : {}),
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Falha ao atualizar deal')
      } else {
        const res = await fetch('/api/deals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipeline_id: pipelineId,
            stage_id: stageId,
            contact_id: contactId,
            title: title.trim(),
            value: Number(value) || 0,
            currency,
            notes: notes || undefined,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Falha ao criar deal')
      }
      toast.success(editing ? 'Deal atualizado' : 'Deal criado')
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-100 bg-popover border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar deal' : 'Novo deal'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="deal-title">Título</Label>
            <Input
              id="deal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="deal-value">Valor</Label>
              <Input
                id="deal-value"
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deal-currency">Moeda</Label>
              <select
                id="deal-currency"
                className="flex h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} {c.code}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deal-contact-q">Contato</Label>
            <Input
              id="deal-contact-q"
              placeholder="Buscar nome ou telefone"
              value={contactQ}
              onChange={(e) => setContactQ(e.target.value)}
              autoComplete="off"
            />
            <select
              id="deal-contact"
              className="flex h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              value={contactId}
              disabled={loadingContacts && contacts.length === 0}
              onChange={(e) => setContactId(e.target.value)}
            >
              <option value="">
                {loadingContacts ? 'Carregando…' : 'Selecione um contato…'}
              </option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {contactLabel(c)}
                </option>
              ))}
            </select>
            {selected && contactId ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="size-3.5 text-primary" />
                Selecionado: {contactLabel(selected)}
              </p>
            ) : null}
            {!loadingContacts && contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum contato encontrado. Ajuste a busca.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deal-notes">Notas</Label>
            <Input
              id="deal-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
