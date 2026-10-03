import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/domain/auth/account'
import { prisma } from '@/domain/db/prisma'
import { CURRENCIES } from '@/lib/currency'

const ALLOWED_CODES = new Set(CURRENCIES.map((c) => c.code))

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    return NextResponse.json({
      id: ctx.account.id,
      name: ctx.account.name,
      default_currency: ctx.account.default_currency,
      owner_user_id: ctx.account.owner_user_id,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const body = (await request.json().catch(() => ({}))) as {
      default_currency?: string
      name?: string
    }

    const data: { defaultCurrency?: string; name?: string } = {}

    if (body.default_currency !== undefined) {
      const code = body.default_currency.trim().toUpperCase()
      if (!ALLOWED_CODES.has(code)) {
        return NextResponse.json(
          { error: 'Invalid currency code' },
          { status: 400 },
        )
      }
      data.defaultCurrency = code
    }

    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) {
        return NextResponse.json(
          { error: 'Account name is required' },
          { status: 400 },
        )
      }
      data.name = name
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No changes' }, { status: 400 })
    }

    const updated = await prisma.tenant.update({
      where: { id: ctx.accountId },
      data,
      select: {
        id: true,
        name: true,
        defaultCurrency: true,
        ownerUserId: true,
      },
    })

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      default_currency: updated.defaultCurrency,
      owner_user_id: updated.ownerUserId,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
