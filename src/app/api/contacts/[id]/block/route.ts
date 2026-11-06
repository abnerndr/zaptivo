import { NextResponse } from 'next/server'
import { requireSessionAccount } from '@/domain/auth/context'
import { blockContact, unblockContact } from '@/domain/whatsapp/blacklist'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    await blockContact(session.accountId, id)
    return NextResponse.json({ ok: true, blocked: true })
  } catch (err) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Block failed'
    const status = message === 'Contact not found' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    await unblockContact(session.accountId, id)
    return NextResponse.json({ ok: true, blocked: false })
  } catch (err) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Unblock failed'
    const status = message === 'Contact not found' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
