'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Broadcast = {
  id: string
  name: string
  template_name: string
  template_language: string
  status: string
  total_recipients: number
  sent_count: number
  delivered_count: number
  read_count: number
  failed_count: number
  scheduled_at?: string
  created_at: string
}

export default function BroadcastDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/broadcasts/${params.id}`)
      if (!res.ok) throw new Error('Broadcast não encontrado')
      const data = (await res.json()) as { broadcast: Broadcast }
      setBroadcast(data.broadcast)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!broadcast) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm text-muted-foreground">Não encontrado</p>
        <Button variant="outline" onClick={() => router.push('/broadcasts')}>
          Voltar
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{broadcast.name}</h1>
        <Button variant="outline" onClick={() => router.push('/broadcasts')}>
          Voltar
        </Button>
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Status</dt>
          <dd>{broadcast.status}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Template</dt>
          <dd>
            {broadcast.template_name} ({broadcast.template_language})
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Destinatários</dt>
          <dd>{broadcast.total_recipients}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Enviados / entregues / lidos</dt>
          <dd>
            {broadcast.sent_count} / {broadcast.delivered_count} /{' '}
            {broadcast.read_count}
          </dd>
        </div>
        {broadcast.scheduled_at ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Agendado</dt>
            <dd>{new Date(broadcast.scheduled_at).toLocaleString()}</dd>
          </div>
        ) : null}
      </dl>
      <Button disabled title="Envio via WAHA em breve">
        Enviar (em breve)
      </Button>
    </div>
  )
}
