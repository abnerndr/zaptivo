'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import type { Deal, PipelineStage } from '@/types'
import { Button } from '@/components/ui/button'
import { PipelineBoard } from '@/components/pipelines/pipeline-board'
import { DealFormDialog } from '@/components/pipelines/deal-form-dialog'

type PipelineRow = {
  id: string
  name: string
  stages: PipelineStage[]
}

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<PipelineRow[]>([])
  const [pipelineId, setPipelineId] = useState<string | null>(null)
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogStageId, setDialogStageId] = useState<string | null>(null)
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)

  const active = pipelines.find((p) => p.id === pipelineId) ?? null

  const loadPipelines = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pipelines')
      if (!res.ok) throw new Error('Falha ao carregar pipelines')
      const data = (await res.json()) as { pipelines: PipelineRow[] }
      setPipelines(data.pipelines)
      setPipelineId((prev) => prev ?? data.pipelines[0]?.id ?? null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDeals = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/deals?pipeline_id=${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error('Falha ao carregar deals')
      const data = (await res.json()) as { deals: Deal[] }
      setDeals(data.deals)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    }
  }, [])

  useEffect(() => {
    void loadPipelines()
  }, [loadPipelines])

  useEffect(() => {
    if (!pipelineId) {
      setDeals([])
      return
    }
    void loadDeals(pipelineId)
  }, [pipelineId, loadDeals])

  const createPipeline = async () => {
    const res = await fetch('/api/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sales pipeline' }),
    })
    if (!res.ok) {
      toast.error('Falha ao criar pipeline')
      return
    }
    const data = (await res.json()) as { pipeline: PipelineRow }
    toast.success('Pipeline criado')
    setPipelines((prev) => [...prev, data.pipeline])
    setPipelineId(data.pipeline.id)
  }

  const onDealMoved = async (dealId: string, newStageId: string) => {
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stage_id: newStageId } : d)),
    )
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: newStageId }),
    })
    if (!res.ok) {
      toast.error('Falha ao mover deal')
      if (pipelineId) void loadDeals(pipelineId)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!active) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 p-6">
        <h1 className="text-xl font-semibold">Pipelines</h1>
        <p className="text-sm text-muted-foreground">
          Nenhum pipeline ainda. Crie o primeiro para começar.
        </p>
        <Button onClick={() => void createPipeline()}>
          <Plus className="size-4" />
          Criar pipeline
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Pipelines</h1>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={active.id}
          onChange={(e) => setPipelineId(e.target.value)}
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => void createPipeline()}>
          <Plus className="size-4" />
          Novo pipeline
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto">
        <PipelineBoard
          stages={active.stages}
          deals={deals}
          onDealMoved={onDealMoved}
          onAddDeal={(stageId) => {
            setEditingDeal(null)
            setDialogStageId(stageId)
            setDialogOpen(true)
          }}
          onEditDeal={(deal) => {
            setEditingDeal(deal)
            setDialogStageId(deal.stage_id)
            setDialogOpen(true)
          }}
        />
      </div>

      <DealFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        pipelineId={active.id}
        stageId={dialogStageId}
        deal={editingDeal}
        onSaved={() => {
          if (pipelineId) void loadDeals(pipelineId)
        }}
      />
    </div>
  )
}
