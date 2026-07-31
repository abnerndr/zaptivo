import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { DEFAULT_FALLBACK_POLICY } from '@/lib/flows/types'

function authorize(req: Request): boolean {
  const secret = process.env.AUTOMATION_CRON_SECRET
  if (!secret) return false
  const header =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return header === secret
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runs = await prisma.flowRun.findMany({
    where: { status: { in: ['active', 'waiting'] } },
    include: { flow: true },
    take: 200,
  })

  const now = Date.now()
  let timedOut = 0
  for (const run of runs) {
    const policy = (run.flow.fallbackPolicy ??
      DEFAULT_FALLBACK_POLICY) as {
      on_timeout_hours?: number
    }
    const hours = policy.on_timeout_hours ?? 24
    const ageMs = now - run.lastAdvancedAt.getTime()
    if (ageMs < hours * 3600_000) continue
    await prisma.flowRun.update({
      where: { id: run.id },
      data: {
        status: 'timed_out',
        endReason: 'timeout',
        endedAt: new Date(),
      },
    })
    timedOut++
  }

  return NextResponse.json({ ok: true, timedOut })
}
