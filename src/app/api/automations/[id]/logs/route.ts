import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import { serializeLog } from '@/lib/automations/serialize'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const automation = await prisma.automation.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const logs = await prisma.automationLog.findMany({
      where: { automationId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ logs: logs.map(serializeLog) })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
