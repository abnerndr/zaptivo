'use client'
import { apiFetch } from '@/lib/api/client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus, Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TRIGGER_META } from '@/lib/automations/trigger-meta'
import type { AutomationTriggerType } from '@/types'

type AutomationRow = {
  id: string
  name: string
  trigger_type: string
  is_active: boolean
  execution_count: number
  steps?: unknown[]
}

export default function AutomationsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<AutomationRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/automations')
      if (!res.ok) throw new Error('Falha ao carregar')
      const data = (await res.json()) as { automations: AutomationRow[] }
      setRows(data.automations)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (row: AutomationRow) => {
    const res = await apiFetch(`/api/automations/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !row.is_active }),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        errors?: Array<{ path?: string; message: string }>
      }
      const first = data.errors?.[0]
      const detail = first
        ? first.path
          ? `${first.message} (${first.path})`
          : first.message
        : 'Não foi possível ativar'
      toast.error(detail, {
        description:
          first?.message === 'tag is required'
            ? 'Abra Editar, escolha ou crie a tag no step e salve.'
            : undefined,
        action:
          first?.message === 'tag is required'
            ? {
                label: 'Editar',
                onClick: () => router.push(`/automations/${row.id}/edit`),
              }
            : undefined,
      })
      return
    }
    void load()
  }

  const duplicate = async (id: string) => {
    const res = await apiFetch(`/api/automations/${id}/duplicate`, {
      method: 'POST',
    })
    if (!res.ok) {
      toast.error('Falha ao duplicar')
      return
    }
    toast.success('Duplicado')
    void load()
  }

  const remove = async (id: string) => {
    if (!confirm('Apagar esta automação?')) return
    const res = await apiFetch(`/api/automations/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Falha ao apagar')
      return
    }
    void load()
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Automações</h1>
        <Button onClick={() => router.push('/automations/new')}>
          <Plus className="size-4" />
          Nova
        </Button>
      </div>
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead>Execuções</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Nenhuma automação.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((a) => {
                const meta =
                  TRIGGER_META[a.trigger_type as AutomationTriggerType]
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${
                          meta?.pillClass ?? ''
                        }`}
                      >
                        {meta?.label ?? a.trigger_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={a.is_active}
                        onChange={() => void toggle(a)}
                      />
                    </TableCell>
                    <TableCell>{a.execution_count}</TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          router.push(`/automations/${a.id}/edit`)
                        }
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          router.push(`/automations/${a.id}/logs`)
                        }
                      >
                        Logs
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => void duplicate(a.id)}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => void remove(a.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
