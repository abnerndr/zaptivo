import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'

export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const tags = await prisma.tag.findMany({
      where: { accountId: ctx.accountId },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({
      tags: tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
      })),
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await req.json()) as { name?: string; color?: string }
    if (!body.name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }
    const tag = await prisma.tag.create({
      data: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        name: body.name,
        color: body.color ?? '#3b82f6',
      },
    })
    return NextResponse.json(tag)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
