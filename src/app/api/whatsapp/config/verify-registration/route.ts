import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'
import { WuzapiTransport } from '@/domain/whatsapp/wuzapi-api'
import { readWhatsappCredential } from '../../../../../../prisma/whatsapp-credential'

/** Return the current WuzAPI session status. */
export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const config = await prisma.whatsappConfig.findUnique({
      where: { accountId: ctx.accountId },
    })
    if (!config || config.provider !== 'WUZAPI') {
      return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 404 })
    }
    try {
      const token = await readWhatsappCredential(ctx.accountId)
      if (!token) throw new Error('WuzAPI token missing')
      const live = await new WuzapiTransport({ token }).status()
      return NextResponse.json({ ok: true, session: live })
    } catch (err) {
      return NextResponse.json({
        ok: false,
        error: err instanceof Error ? err.message : 'WuzAPI unreachable',
        stored_status: config.status,
      })
    }
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
