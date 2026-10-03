import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/domain/auth/account'
import { prisma } from '@/domain/db/prisma'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const account = await requireRole('admin')

    const updated = await prisma.apiKey.updateMany({
      where: {
        id,
        accountId: account.accountId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    })

    if (updated.count === 0) {
      return NextResponse.json(
        { error: 'API key not found or already revoked' },
        { status: 404 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
