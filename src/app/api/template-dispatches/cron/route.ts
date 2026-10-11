import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { runDispatch } from '@/domain/template-dispatches/run'

const STALE_SENDING_MS = 15 * 60 * 1000

function authorize(req: Request): boolean {
  const secret = process.env.AUTOMATION_CRON_SECRET
  if (!secret) return false
  const header =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return header === secret
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  // A crashed run leaves the dispatch in 'sending': put it back in the queue
  // so its pending recipients run again (sent/failed recipients are kept).
  await prisma.templateDispatch.updateMany({
    where: {
      status: 'sending',
      runAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) },
    },
    data: { status: 'queued' },
  })
  const due = await prisma.templateDispatch.findMany({
    where: {
      status: { in: ['queued', 'scheduled'] },
      runAt: { lte: now },
    },
    select: { id: true },
    take: 20,
  })

  let sent = 0
  let failed = 0
  for (const row of due) {
    const result = await runDispatch(row.id)
    sent += result.sent
    failed += result.failed
  }

  return NextResponse.json({ ok: true, dispatches: due.length, sent, failed })
}
