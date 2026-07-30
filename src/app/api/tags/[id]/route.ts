import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'

type Ctx = { params: Promise<{ id: string }> }

function toErrorResponse(err: unknown) {
  if (err instanceof Response) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: err.status || 401 })
  }
  console.error('[api/tags/[id]]', err)
  return NextResponse.json(
    { error: err instanceof Error ? err.message : 'Internal error' },
    { status: 500 },
  )
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.tag.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const body = (await req.json()) as { name?: string; color?: string }
    const tag = await prisma.tag.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
      },
    })
    return NextResponse.json({
      id: tag.id,
      name: tag.name,
      color: tag.color,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.tag.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.tag.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
