import { NextResponse } from 'next/server'
import { requireSessionAccount } from '@/domain/auth/context'
import { prisma } from '@/domain/db/prisma'

/**
 * History pull was a WAHA sync. With Evolution, new messages arrive on
 * the webhook, so this route does not call the provider.
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
