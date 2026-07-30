'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import type { Deal, PipelineStage } from '@/types'
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
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('Sales pipeline')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogStageId, setDialogStageId] = useState<string | null>(null)
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const active = pipelines.find((p) => p.id === pipelineId) ?? null

  const loadPipelines = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/pipelines', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : `Falha ao carregar pipelines (${res.status})`,
        )
      }
      const list = (data.pipelines as PipelineRow[]) ?? []
      setPipelines(list)
      setPipelineId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev
        return list[0]?.id ?? null
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro'
      setLoadError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDeals = useCallback(async (id: string) => {
    try {
      const res = await fetch(
        `/api/deals?pipeline_id=${encodeURIComponent(id)}`,
        { cache: 'no-store' },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : `Falha ao carregar deals (${res.status})`,
        )
      }
      setDeals((data.deals as Deal[]) ?? [])
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
    const name = newName.trim() || 'Sales pipeline'
    setCreating(true)
    try {
      const res = await fetch('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : `Falha ao criar pipeline (${res.status})`,
        )
      }
      const pipeline = data.pipeline as PipelineRow | undefined
      if (!pipeline?.id) {
        throw new Error('Resposta inválida da API ao criar pipeline')
      }
      toast.success('Pipeline criado')
      setCreateOpen(false)
      setNewName('Sales pipeline')
      setPipelines((prev) => {
        if (prev.some((p) => p.id === pipeline.id)) return prev
        return [...prev, pipeline]
      })
      setPipelineId(pipeline.id)
      // Refresh from server so stages are guaranteed present
      void loadPipelines()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setCreating(false)
    }
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
      const data = await res.json().catch(() => ({}))
      toast.error(
        typeof data.error === 'string' ? data.error : 'Falha ao mover deal',
      )
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

  const createDialog = (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent className="bg-popover border-border sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo pipeline</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="pipeline-name">Nome</Label>
          <Input
            id="pipeline-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createPipeline()
            }}
          />
          <p className="text-xs text-muted-foreground">
            Stages padrão (Lead → Won) serão criados automaticamente.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void createPipeline()} disabled={creating}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : null}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (!active) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3">
        <h1 className="text-xl font-semibold">Pipelines</h1>
        <p className="text-sm text-muted-foreground">
          {loadError
            ? `Erro: ${loadError}`
            : 'Nenhum pipeline ainda. Crie o primeiro para começar.'}
        </p>
        <div className="flex gap-2">
          {loadError ? (
            <Button variant="outline" onClick={() => void loadPipelines()}>
              Tentar de novo
            </Button>
          ) : null}
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Criar pipeline
          </Button>
        </div>
        {createDialog}
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Pipelines</h1>
        <select
          aria-label="Pipeline ativo"
          className="h-9 min-w-[12rem] rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={active.id}
          onChange={(e) => setPipelineId(e.target.value)}
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" />
          Novo pipeline
        </Button>
      </div>

      {(!active.stages || active.stages.length === 0) && (
        <p className="text-sm text-amber-500">
          Este pipeline não tem stages. Recarregue a página ou crie outro.
        </p>
      )}

      <div className="min-h-[28rem] flex-1 overflow-x-auto">
        <PipelineBoard
          stages={active.stages ?? []}
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
      {createDialog}
    </div>
  )
}
