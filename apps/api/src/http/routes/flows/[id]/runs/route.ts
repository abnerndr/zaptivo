import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import { serializeRun } from '@/lib/flows/serialize'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const flow = await prisma.flow.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!flow) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const runs = await prisma.flowRun.findMany({
      where: { flowId: id },
      include: { events: { orderBy: { createdAt: 'asc' } } },
      orderBy: { startedAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ runs: runs.map(serializeRun) })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
