import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import { serializeDeal } from '@/lib/pipelines/serialize'

export async function GET(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const pipelineId = new URL(req.url).searchParams.get('pipeline_id')
    if (!pipelineId) {
      return NextResponse.json({ error: 'pipeline_id required' }, { status: 400 })
    }
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: pipelineId, accountId: ctx.accountId },
    })
    if (!pipeline) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const deals = await prisma.deal.findMany({
      where: { pipelineId, accountId: ctx.accountId },
      include: { contact: true },
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json({ deals: deals.map(serializeDeal) })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await req.json()) as {
      pipeline_id?: string
      stage_id?: string
      contact_id?: string
      title?: string
      value?: number
      currency?: string
      notes?: string
      expected_close_date?: string
    }
    if (
      !body.pipeline_id ||
      !body.stage_id ||
      !body.contact_id ||
      !body.title?.trim()
    ) {
      return NextResponse.json(
        { error: 'pipeline_id, stage_id, contact_id, title required' },
        { status: 400 },
      )
    }
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: body.pipeline_id, accountId: ctx.accountId },
      include: { stages: true },
    })
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 })
    }
    if (!pipeline.stages.some((s) => s.id === body.stage_id)) {
      return NextResponse.json({ error: 'Invalid stage_id' }, { status: 400 })
    }
    const contact = await prisma.contact.findFirst({
      where: { id: body.contact_id, accountId: ctx.accountId },
    })
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }
    const deal = await prisma.deal.create({
      data: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        pipelineId: body.pipeline_id,
        stageId: body.stage_id,
        contactId: body.contact_id,
        title: body.title.trim(),
        value: body.value ?? 0,
        currency: body.currency ?? 'BRL',
        notes: body.notes ?? null,
        expectedCloseDate: body.expected_close_date
          ? new Date(body.expected_close_date)
          : null,
        status: 'active',
      },
      include: { contact: true },
    })
    return NextResponse.json({ deal: serializeDeal(deal) }, { status: 201 })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
