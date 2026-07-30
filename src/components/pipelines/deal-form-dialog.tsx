'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
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

  useEffect(() => {
    if (!open) return
    setTitle(deal?.title ?? '')
    setValue(String(deal?.value ?? 0))
    setCurrency(deal?.currency ?? 'BRL')
    setNotes(deal?.notes ?? '')
    setContactId(deal?.contact_id ?? '')
    setContactQ('')
  }, [open, deal])

  const loadContacts = useCallback(async (q: string) => {
    setLoadingContacts(true)
    try {
      const qs = new URLSearchParams({ pageSize: '20', ...(q ? { q } : {}) })
      const res = await fetch(`/api/contacts?${qs}`)
      if (!res.ok) throw new Error('Falha ao buscar contatos')
      const data = (await res.json()) as { contacts: ContactOption[] }
      setContacts(data.contacts)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoadingContacts(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => void loadContacts(contactQ), 200)
    return () => clearTimeout(t)
  }, [open, contactQ, loadContacts])

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
        if (!res.ok) throw new Error('Falha ao atualizar deal')
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
        if (!res.ok) throw new Error('Falha ao criar deal')
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
      <DialogContent className="bg-popover border-border sm:max-w-md">
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
              <Input
                id="deal-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deal-contact-q">Contato</Label>
            <Input
              id="deal-contact-q"
              placeholder="Buscar nome ou telefone"
              value={contactQ}
              onChange={(e) => setContactQ(e.target.value)}
            />
            <div className="max-h-36 overflow-y-auto rounded-md border border-border">
              {loadingContacts ? (
                <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Buscando…
                </div>
              ) : contacts.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">
                  Nenhum contato
                </p>
              ) : (
                contacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setContactId(c.id)}
                    className={`flex w-full flex-col px-2 py-1.5 text-left text-sm hover:bg-muted ${
                      contactId === c.id ? 'bg-muted' : ''
                    }`}
                  >
                    <span>{c.name || c.phone}</span>
                    {c.name ? (
                      <span className="text-xs text-muted-foreground">
                        {c.phone}
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
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
