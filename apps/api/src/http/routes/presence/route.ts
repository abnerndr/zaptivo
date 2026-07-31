import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import { notifyAccount } from '@/lib/db/notify'

export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const rows = await prisma.memberPresence.findMany({
      where: { accountId: ctx.accountId },
    })
    return NextResponse.json({
      presence: rows.map((r) => ({
        user_id: r.userId,
        status: r.status,
        last_seen_at: r.lastSeenAt.toISOString(),
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
    const body = (await req.json()) as { status?: string }
    const status = body.status === 'away' ? 'away' : 'online'
    const row = await prisma.memberPresence.upsert({
      where: { userId: ctx.userId },
      create: {
        userId: ctx.userId,
        accountId: ctx.accountId,
        status,
        lastSeenAt: new Date(),
      },
      update: {
        status,
        lastSeenAt: new Date(),
        accountId: ctx.accountId,
      },
    })
    await notifyAccount({
      table: 'member_presence',
      op: 'UPDATE',
      id: row.userId,
      accountId: ctx.accountId,
    }).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
