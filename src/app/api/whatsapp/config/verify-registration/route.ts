import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'
import { getSession } from '@/domain/whatsapp/waha-api'

/** Replaces Meta registration verify — returns live WAHA session status. */
export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const config = await prisma.whatsappConfig.findUnique({
      where: { accountId: ctx.accountId },
    })
    if (!config) {
      return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 404 })
    }
    try {
      const live = await getSession(config.wahaSession)
      return NextResponse.json({ ok: true, session: live })
    } catch (err) {
      return NextResponse.json({
        ok: false,
        error: err instanceof Error ? err.message : 'WAHA unreachable',
        stored_status: config.status,
      })
    }
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
