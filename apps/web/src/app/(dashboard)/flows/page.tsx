'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type FlowRow = {
  id: string
  name: string
  status: string
  trigger_type: string
  execution_count: number
}

type Template = {
  slug: string
  name: string
  description: string
}

export default function FlowsPage() {
  const router = useRouter()
  const [flows, setFlows] = useState<FlowRow[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [fRes, tRes] = await Promise.all([
        fetch('/api/flows'),
        fetch('/api/flows/templates'),
      ])
      if (!fRes.ok) throw new Error('Falha ao carregar flows')
      const fData = (await fRes.json()) as { flows: FlowRow[] }
      setFlows(fData.flows)
      if (tRes.ok) {
        const tData = (await tRes.json()) as { templates: Template[] }
        setTemplates(tData.templates)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createBlank = async () => {
    const res = await fetch('/api/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Novo flow' }),
    })
    if (!res.ok) {
      toast.error('Falha ao criar')
      return
    }
    const data = (await res.json()) as { flow: { id: string } }
    router.push(`/flows/${data.flow.id}`)
  }

  const createFromTemplate = async (slug: string) => {
    const res = await fetch('/api/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_slug: slug }),
    })
    if (!res.ok) {
      toast.error('Falha ao criar do template')
      return
    }
    const data = (await res.json()) as { flow: { id: string } }
    router.push(`/flows/${data.flow.id}`)
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Flows</h1>
        <Button onClick={() => void createBlank()}>
          <Plus className="size-4" />
          Novo
        </Button>
      </div>

      {templates.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm text-muted-foreground">Templates</h2>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <Button
                key={t.slug}
                size="sm"
                variant="outline"
                onClick={() => void createFromTemplate(t.slug)}
              >
                {t.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Execuções</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Nenhum flow.
                </TableCell>
              </TableRow>
            ) : (
              flows.map((f) => (
                <TableRow
                  key={f.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/flows/${f.id}`)}
                >
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell>{f.status}</TableCell>
                  <TableCell>{f.trigger_type}</TableCell>
                  <TableCell>{f.execution_count}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
