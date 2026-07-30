import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/pipelines/defaults'
import { serializePipeline } from '@/lib/pipelines/serialize'

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
    if (err instanceof Response) return err
    console.error('[api/pipelines]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await req.json()) as { name?: string }
    const name = body.name?.trim() || 'Sales pipeline'
    const pipeline = await prisma.pipeline.create({
      data: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        name,
        stages: {
          create: DEFAULT_PIPELINE_STAGES.map((s) => ({
            name: s.name,
            position: s.position,
            color: s.color,
          })),
        },
      },
      include: { stages: true },
    })
    return NextResponse.json(
      { pipeline: serializePipeline(pipeline) },
      { status: 201 },
    )
  } catch (err) {
    if (err instanceof Response) return err
    console.error('[api/pipelines POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
