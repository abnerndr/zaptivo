import { NextResponse } from 'next/server'
import { requireSessionAccount } from '@/domain/auth/context'
import { prisma } from '@/domain/db/prisma'
import { importWuzapiContacts } from '@/domain/whatsapp/import-contacts'

/**
 * For WuzAPI accounts, import contact names/avatars from the provider.
 * Evolution relies on the webhook for new messages.
 */
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

    if (config.provider === 'WUZAPI') {
      const result = await importWuzapiContacts(ctx.accountId)
      return NextResponse.json({ ok: true, provider: 'WUZAPI', ...result })
    }

    return NextResponse.json({
      ok: true,
      skipped: 'evolution',
      chats: 0,
    })
  } catch (err) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Sync failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
