import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/domain/auth/account'
import { generateApiKey } from '@/domain/api-keys/keys'
import { isApiScope } from '@/domain/api-keys/scopes'
import { prisma } from '@/domain/db/prisma'

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const rows = await prisma.apiKey.findMany({
      where: { accountId: ctx.accountId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    })

    const keys = rows.map((k) => ({
      id: k.id,
      name: k.name,
      key_prefix: k.keyPrefix,
      scopes: k.scopes,
      last_used_at: k.lastUsedAt?.toISOString() ?? null,
      expires_at: k.expiresAt?.toISOString() ?? null,
      revoked_at: k.revokedAt?.toISOString() ?? null,
      created_at: k.createdAt.toISOString(),
    }))

    return NextResponse.json({ keys })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const body = (await request.json().catch(() => ({}))) as {
      name?: string
      scopes?: string[]
    }

    const name = body.name?.trim()
    if (!name) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }

    const scopes = (body.scopes ?? []).filter(isApiScope)

    const generated = generateApiKey()
    const row = await prisma.apiKey.create({
      data: {
        accountId: ctx.accountId,
        createdBy: ctx.userId,
        name,
        keyPrefix: generated.prefix,
        keyHash: generated.hash,
        scopes,
      },
    })

    return NextResponse.json({
      plaintext: generated.plaintext,
      key: {
        id: row.id,
        name: row.name,
        key_prefix: row.keyPrefix,
        scopes: row.scopes,
        last_used_at: null,
        expires_at: null,
        revoked_at: null,
        created_at: row.createdAt.toISOString(),
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
