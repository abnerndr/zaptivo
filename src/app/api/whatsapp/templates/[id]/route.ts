import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const body = (await req.json()) as Record<string, unknown>
    const existing = await prisma.messageTemplate.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const updated = await prisma.messageTemplate.update({
      where: { id },
      data: {
        ...(typeof body.name === 'string' ? { name: body.name } : {}),
        ...(typeof body.body_text === 'string' ? { bodyText: body.body_text } : {}),
        ...(typeof body.status === 'string' ? { status: body.status } : {}),
        ...(typeof body.language === 'string' ? { language: body.language } : {}),
        ...(typeof body.footer_text === 'string' || body.footer_text === null
          ? { footerText: body.footer_text as string | null }
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
    const existing = await prisma.messageTemplate.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.messageTemplate.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
