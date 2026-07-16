import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'

export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const count = await prisma.notification.count({
      where: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        readAt: null,
      },
    })
    return NextResponse.json({ count })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
