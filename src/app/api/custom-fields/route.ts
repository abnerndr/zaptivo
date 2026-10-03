import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'

function toErrorResponse(err: unknown) {
  if (err instanceof Response) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: err.status || 401 })
  }
  console.error('[api/custom-fields]', err)
  return NextResponse.json(
    { error: err instanceof Error ? err.message : 'Internal error' },
    { status: 500 },
  )
}

function serialize(f: {
  id: string
  fieldName: string
  fieldType: string
  fieldOptions: unknown
  createdAt: Date
}) {
  return {
    id: f.id,
    field_name: f.fieldName,
    field_type: f.fieldType,
    field_options: f.fieldOptions ?? null,
    created_at: f.createdAt.toISOString(),
  }
}

export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const rows = await prisma.customField.findMany({
      where: { accountId: ctx.accountId },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ custom_fields: rows.map(serialize) })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await req.json()) as {
      field_name?: string
      field_type?: string
      field_options?: unknown
    }
    const name = body.field_name?.trim()
    if (!name) {
      return NextResponse.json({ error: 'field_name required' }, { status: 400 })
    }
    const fieldType = body.field_type?.trim() || 'text'
    const row = await prisma.customField.create({
      data: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        fieldName: name,
        fieldType,
        fieldOptions:
          body.field_options != null
            ? (body.field_options as Prisma.InputJsonValue)
            : undefined,
      },
    })
    return NextResponse.json({ custom_field: serialize(row) }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
