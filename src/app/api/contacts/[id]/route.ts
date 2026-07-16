import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const body = (await req.json()) as Record<string, unknown>
    const existing = await prisma.contact.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const updated = await prisma.contact.update({
      where: { id },
      data: {
        ...(typeof body.name === 'string' ? { name: body.name } : {}),
        ...(typeof body.phone === 'string' ? { phone: body.phone } : {}),
        ...(typeof body.email === 'string' || body.email === null
          ? { email: body.email as string | null }
          : {}),
        ...(typeof body.company === 'string' || body.company === null
          ? { company: body.company as string | null }
          : {}),
      },
    })
    return NextResponse.json(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.contact.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.contact.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
