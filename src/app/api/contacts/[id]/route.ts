import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'

type Ctx = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    let typeIdUpdate: { typeId: string | null } | Record<string, never> = {}
    if ('typeId' in body) {
      if (body.typeId === null) {
        typeIdUpdate = { typeId: null }
      } else if (
        typeof body.typeId === 'string' &&
        UUID_RE.test(body.typeId)
      ) {
        const type = await prisma.contactType.findFirst({
          where: { id: body.typeId, accountId: session.accountId },
          select: { id: true },
        })
        if (!type) {
          return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
        }
        typeIdUpdate = { typeId: type.id }
      } else {
        return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
      }
    }
    const updated = await prisma.contact.update({
      where: { id },
      data: {
        ...typeIdUpdate,
        ...(typeof body.name === 'string'
          ? {
              name: body.name.trim() || null,
              nameLocked: Boolean(body.name.trim()),
            }
          : {}),
        ...(typeof body.phone === 'string'
          ? {
              phone: body.phone.trim(),
              phoneNormalized: body.phone.replace(/\D/g, '') || null,
            }
          : {}),
        ...(typeof body.email === 'string' || body.email === null
          ? { email: body.email as string | null }
          : {}),
        ...(typeof body.company === 'string' || body.company === null
          ? { company: body.company as string | null }
          : {}),
      },
    })
    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      name_locked: updated.nameLocked,
      phone: updated.phone,
      email: updated.email,
      company: updated.company,
      avatar_url: updated.avatarUrl,
      type_id: updated.typeId,
    })
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
