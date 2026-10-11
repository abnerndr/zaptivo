import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'
import {
  MAX_DISPATCH_RECIPIENTS,
  dispatchTiming,
  selectContactIds,
} from '@/domain/template-dispatches/select'
import { runDispatch } from '@/domain/template-dispatches/run'

export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const rows = await prisma.templateDispatch.findMany({
      where: { accountId: ctx.accountId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        templateId: true,
        status: true,
        runAt: true,
        createdAt: true,
        template: { select: { name: true } },
        _count: { select: { recipients: true } },
      },
    })
    return NextResponse.json({
      dispatches: rows.map((row) => ({
        id: row.id,
        templateId: row.templateId,
        templateName: row.template.name,
        status: row.status,
        runAt: row.runAt,
        createdAt: row.createdAt,
        recipientCount: row._count.recipients,
      })),
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error('[api/template-dispatches GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const templateId = typeof body.templateId === 'string' ? body.templateId : ''
    const contactIds = Array.isArray(body.contactIds)
      ? body.contactIds.filter((id): id is string => typeof id === 'string')
      : []
    const typeId = typeof body.typeId === 'string' && body.typeId ? body.typeId : null
    const runAt = typeof body.runAt === 'string' && body.runAt ? body.runAt : null

    const template = templateId
      ? await prisma.messageTemplate.findFirst({
          where: { id: templateId, accountId: ctx.accountId, status: 'ACTIVE' },
          select: { id: true },
        })
      : null
    if (!template) {
      return NextResponse.json({ error: 'Template inválido' }, { status: 400 })
    }

    const contacts =
      contactIds.length > 0
        ? await prisma.contact.findMany({
            where: { accountId: ctx.accountId, id: { in: contactIds } },
            select: { id: true, typeId: true },
          })
        : []

    const ids = [
      ...new Set(selectContactIds({ contacts, selectedIds: contactIds, typeId })),
    ]
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Nenhum contato selecionado' }, { status: 400 })
    }

    if (ids.length > MAX_DISPATCH_RECIPIENTS) {
      return NextResponse.json({ error: 'Lista grande demais' }, { status: 400 })
    }

    const timing = dispatchTiming(runAt, new Date())

    const created = await prisma.templateDispatch.create({
      data: {
        accountId: ctx.accountId,
        templateId: template.id,
        status: timing.status,
        runAt: timing.runAt,
        recipients: {
          create: ids.map((contactId) => ({ contactId, status: 'pending' })),
        },
      },
      select: { id: true },
    })

    if (timing.status === 'queued') {
      await runDispatch(created.id)
    }

    const final = await prisma.templateDispatch.findUnique({
      where: { id: created.id },
      select: { id: true, status: true, runAt: true },
    })

    return NextResponse.json(
      {
        id: created.id,
        status: final?.status ?? timing.status,
        runAt: final?.runAt ?? timing.runAt,
      },
      { status: 201 },
    )
  } catch (err) {
    if (err instanceof Response) return err
    console.error('[api/template-dispatches POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
