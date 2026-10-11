import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'
import { parseContactTypeInput } from '@/domain/contacts/contact-type'

export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const rows = await prisma.contactType.findMany({
      where: { accountId: ctx.accountId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true },
    })
    return NextResponse.json({ types: rows })
  } catch (err) {
    if (err instanceof Response) return err
    console.error('[api/contact-types]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const parsed = parseContactTypeInput({ name: body.name, color: body.color })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const created = await prisma.contactType.create({
      data: {
        accountId: ctx.accountId,
        name: parsed.name,
        color: parsed.color,
      },
      select: { id: true, name: true, color: true },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Tipo já existe' }, { status: 409 })
    }
    console.error('[api/contact-types]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
