'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
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

type BroadcastRow = {
  id: string
  name: string
  template_name: string
  status: string
  total_recipients: number
  created_at: string
}

export default function BroadcastsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<BroadcastRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/broadcasts')
      if (!res.ok) throw new Error('Falha ao carregar')
      const data = (await res.json()) as { broadcasts: BroadcastRow[] }
      setRows(data.broadcasts)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Broadcasts</h1>
        <Button onClick={() => router.push('/broadcasts/new')}>
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
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Destinatários</TableHead>
              <TableHead>Criado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Nenhum broadcast ainda.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link
                      href={`/broadcasts/${b.id}`}
                      className="font-medium hover:underline"
                    >
                      {b.name}
                    </Link>
                  </TableCell>
                  <TableCell>{b.template_name}</TableCell>
                  <TableCell>{b.status}</TableCell>
                  <TableCell>{b.total_recipients}</TableCell>
                  <TableCell>
                    {new Date(b.created_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
