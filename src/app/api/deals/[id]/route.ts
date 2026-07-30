import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import { serializeDeal } from '@/lib/pipelines/serialize'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.deal.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const body = (await req.json()) as {
      stage_id?: string
      title?: string
      value?: number
      currency?: string
      notes?: string | null
      expected_close_date?: string | null
      status?: 'active' | 'won' | 'lost'
      contact_id?: string
    }
    if (body.stage_id) {
      const stage = await prisma.pipelineStage.findFirst({
        where: { id: body.stage_id, pipelineId: existing.pipelineId },
      })
      if (!stage) {
        return NextResponse.json({ error: 'Invalid stage_id' }, { status: 400 })
      }
    }
    if (body.contact_id) {
      const contact = await prisma.contact.findFirst({
        where: { id: body.contact_id, accountId: session.accountId },
      })
      if (!contact) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      }
    }
    const deal = await prisma.deal.update({
      where: { id },
      data: {
        ...(body.stage_id ? { stageId: body.stage_id } : {}),
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.value !== undefined ? { value: body.value } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.contact_id ? { contactId: body.contact_id } : {}),
        ...(body.expected_close_date !== undefined
          ? {
              expectedCloseDate: body.expected_close_date
                ? new Date(body.expected_close_date)
                : null,
            }
          : {}),
      },
      include: { contact: true },
    })
    return NextResponse.json({ deal: serializeDeal(deal) })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.deal.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.deal.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
