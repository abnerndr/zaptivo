import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'
import { serializeBroadcast } from '@/domain/broadcasts/serialize'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const broadcast = await prisma.broadcast.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!broadcast) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ broadcast: serializeBroadcast(broadcast) })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.broadcast.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: 'Only draft broadcasts can be edited' },
        { status: 400 },
      )
    }
    const body = (await req.json()) as {
      name?: string
      scheduled_at?: string | null
    }
    const broadcast = await prisma.broadcast.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.scheduled_at !== undefined
          ? {
              scheduledAt: body.scheduled_at
                ? new Date(body.scheduled_at)
                : null,
            }
          : {}),
      },
    })
    return NextResponse.json({ broadcast: serializeBroadcast(broadcast) })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.broadcast.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.broadcast.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
