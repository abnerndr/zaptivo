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
    if (err instanceof Response) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await req.json()) as { name?: string; color?: string }
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }
    const tag = await prisma.tag.create({
      data: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        name: body.name.trim(),
        color: body.color ?? '#3b82f6',
      },
    })
    return NextResponse.json(
      { id: tag.id, name: tag.name, color: tag.color },
      { status: 201 },
    )
  } catch (err) {
    if (err instanceof Response) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[api/tags POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
