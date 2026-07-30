'use client'

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

type RunRow = {
  id: string
  status: string
  end_reason: string | null
  started_at: string
  ended_at: string | null
}

export default function FlowRunsPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [runs, setRuns] = useState<RunRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/flows/${params.id}/runs`)
      if (!res.ok) throw new Error('Falha ao carregar runs')
      const data = (await res.json()) as { runs: RunRow[] }
      setRuns(data.runs)
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
        <h1 className="text-xl font-semibold">Runs</h1>
        <Button
          variant="outline"
          onClick={() => router.push(`/flows/${params.id}`)}
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
              <TableHead>ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead>Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Nenhum run ainda.
                </TableCell>
              </TableRow>
            ) : (
              runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    {r.id.slice(0, 8)}
                  </TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell>
                    {new Date(r.started_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {r.ended_at
                      ? new Date(r.ended_at).toLocaleString()
                      : '—'}
                  </TableCell>
                  <TableCell>{r.end_reason ?? '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
