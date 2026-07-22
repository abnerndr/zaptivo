import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const profiles = await prisma.profile.findMany({
      where: { accountId: ctx.accountId },
      orderBy: [{ accountRole: 'asc' }, { createdAt: 'asc' }],
      select: {
        userId: true,
        fullName: true,
        email: true,
        avatarUrl: true,
        accountRole: true,
        createdAt: true,
      },
    })

    const members = profiles.map((p) => ({
      user_id: p.userId,
      full_name: p.fullName,
      email: p.email,
      avatar_url: p.avatarUrl,
      role: p.accountRole,
      joined_at: p.createdAt.toISOString(),
    }))

    return NextResponse.json({ members })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const body = await request.json().catch(() => ({}))
    return NextResponse.json({ ok: true, accountId: ctx.accountId, body })
  } catch (err) {
    return toErrorResponse(err)
  }
}
