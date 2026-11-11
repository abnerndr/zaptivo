import { NextResponse } from 'next/server'
import { requireSessionAccount } from '@/domain/auth/context'
import { prisma } from '@/domain/db/prisma'
import { importWuzapiContacts } from '@/domain/whatsapp/import-contacts'

export async function POST() {
  try {
    const ctx = await requireSessionAccount()
    const config = await prisma.whatsappConfig.findUnique({
      where: { accountId: ctx.accountId },
    })
    if (!config) {
      return NextResponse.json(
        { error: 'WhatsApp não configurado' },
        { status: 400 },
      )
    }

    if (config.provider !== 'WUZAPI') {
      return NextResponse.json({ error: 'Vincule o WhatsApp à WuzAPI' }, { status: 400 })
    }
    const result = await importWuzapiContacts(ctx.accountId)
    return NextResponse.json({ ok: true, provider: 'WUZAPI', ...result })
  } catch (err) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Sync failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
