import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'

type Ctx = { params: Promise<{ id: string }> }

function toErrorResponse(err: unknown) {
  if (err instanceof Response) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: err.status || 401 })
  }
  console.error('[api/custom-fields/[id]]', err)
  return NextResponse.json(
    { error: err instanceof Error ? err.message : 'Internal error' },
    { status: 500 },
  )
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.customField.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const body = (await req.json()) as {
      field_name?: string
      field_type?: string
      field_options?: unknown
    }
    const row = await prisma.customField.update({
      where: { id },
      data: {
        ...(body.field_name !== undefined
          ? { fieldName: body.field_name.trim() }
          : {}),
        ...(body.field_type !== undefined
          ? { fieldType: body.field_type.trim() }
          : {}),
        ...(body.field_options !== undefined
          ? {
              fieldOptions: body.field_options as Prisma.InputJsonValue,
            }
          : {}),
      },
    })
    return NextResponse.json({
      custom_field: {
        id: row.id,
        field_name: row.fieldName,
        field_type: row.fieldType,
        field_options: row.fieldOptions,
        created_at: row.createdAt.toISOString(),
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.customField.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.customField.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
