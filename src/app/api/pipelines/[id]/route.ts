import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import { serializePipeline } from '@/lib/pipelines/serialize'

type Ctx = { params: Promise<{ id: string }> }

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

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const body = (await req.json()) as { name?: string }
    const existing = await prisma.pipeline.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const name = body.name?.trim()
    if (!name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }
    const pipeline = await prisma.pipeline.update({
      where: { id },
      data: { name },
      include: { stages: true },
    })
    return NextResponse.json({ pipeline: serializePipeline(pipeline) })
  } catch (err) {
    return toErrorResponse(err, '[api/pipelines PATCH]')
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.pipeline.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.pipeline.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err, '[api/pipelines DELETE]')
  }
}
