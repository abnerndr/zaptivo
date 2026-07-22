import { NextResponse } from 'next/server'
import {
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { prisma } from '@/lib/db/prisma'
import { createHash, randomBytes } from 'crypto'
import type { AccountRole } from '@/lib/auth/roles'

export async function GET() {
  try {
    const ctx = await requireRole('admin')
    const rows = await prisma.accountInvitation.findMany({
      where: {
        accountId: ctx.accountId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        role: true,
        label: true,
        createdAt: true,
        expiresAt: true,
      },
    })

    const invitations = rows
      .filter((r) => r.role !== 'owner')
      .map((r) => ({
        id: r.id,
        role: r.role as 'admin' | 'agent' | 'viewer',
        label: r.label,
        created_at: r.createdAt.toISOString(),
        expires_at: r.expiresAt.toISOString(),
      }))

    return NextResponse.json({ invitations })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const body = (await request.json().catch(() => ({}))) as {
      role?: AccountRole
      label?: string
      expiresInDays?: number
    }

    const role = body.role ?? 'agent'
    if (role === 'owner' || !['admin', 'agent', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const days = Math.min(Math.max(Number(body.expiresInDays) || 7, 1), 30)
    const token = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    const invite = await prisma.accountInvitation.create({
      data: {
        accountId: ctx.accountId,
        tokenHash,
        role,
        label: body.label?.trim() || null,
        createdByUserId: ctx.userId,
        expiresAt,
      },
    })

    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
    const url = `${site}/join/${token}`

    return NextResponse.json({
      invitation: {
        id: invite.id,
        role: invite.role,
        label: invite.label,
        created_at: invite.createdAt.toISOString(),
        expires_at: invite.expiresAt.toISOString(),
      },
      url,
      expiresInDays: days,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
