import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { prisma } from '@/lib/db/prisma'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const account = await requireRole('admin')

    const deleted = await prisma.accountInvitation.deleteMany({
      where: {
        id,
        accountId: account.accountId,
        acceptedAt: null,
      },
    })

    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
