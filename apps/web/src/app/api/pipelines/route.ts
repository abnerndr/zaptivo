import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/pipelines/defaults'
import { serializePipeline } from '@/lib/pipelines/serialize'

function toErrorResponse(err: unknown, label: string) {
  if (err instanceof Response) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: err.status || 401 },
    )
  }
  const message = err instanceof Error ? err.message : 'Internal error'
  console.error(label, err)
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const rows = await prisma.pipeline.findMany({
      where: { accountId: ctx.accountId },
      include: { stages: true },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ pipelines: rows.map(serializePipeline) })
  } catch (err) {
    return toErrorResponse(err, '[api/pipelines GET]')
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    if (!ctx.accountId) {
      return NextResponse.json(
        { error: 'Conta não vinculada ao perfil' },
        { status: 400 },
      )
    }

    const body = (await req.json().catch(() => ({}))) as { name?: string }
    const name = body.name?.trim() || 'Sales pipeline'

    // Create pipeline first, then stages — avoids nested-create edge
    // cases with the Prisma driver adapter.
    const created = await prisma.pipeline.create({
      data: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        name,
      },
    })

    await prisma.pipelineStage.createMany({
      data: DEFAULT_PIPELINE_STAGES.map((s) => ({
        pipelineId: created.id,
        name: s.name,
        position: s.position,
        color: s.color,
      })),
    })

    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { id: created.id, accountId: ctx.accountId },
      include: { stages: true },
    })

    return NextResponse.json(
      { pipeline: serializePipeline(pipeline) },
      { status: 201 },
    )
  } catch (err) {
    return toErrorResponse(err, '[api/pipelines POST]')
  }
}
