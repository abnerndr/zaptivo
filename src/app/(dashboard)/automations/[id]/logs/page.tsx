'use client'
import { apiFetch } from '@/lib/api/client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type LogRow = {
  id: string
  trigger_event: string
  status: string
  error_message: string | null
  created_at: string
}

export default function AutomationLogsPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/automations/${params.id}/logs`)
      if (!res.ok) throw new Error('Falha ao carregar logs')
      const data = (await res.json()) as { logs: LogRow[] }
      setLogs(data.logs)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Logs</h1>
        <Button
          variant="outline"
          onClick={() => router.push('/automations')}
        >
          Voltar
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
              <TableHead>Quando</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Erro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Sem logs ainda (engine ainda não está ligado ao webhook).
                </TableCell>
              </TableRow>
            ) : (
              logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    {new Date(l.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{l.trigger_event}</TableCell>
                  <TableCell>{l.status}</TableCell>
                  <TableCell>{l.error_message ?? '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
