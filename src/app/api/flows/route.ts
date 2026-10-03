import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'
import { serializeFlow } from '@/domain/flows/serialize'
import { getFlowTemplate } from '@/domain/flows/templates'
import { DEFAULT_FALLBACK_POLICY } from '@/domain/flows/types'

export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const rows = await prisma.flow.findMany({
      where: { accountId: ctx.accountId },
      include: { nodes: true },
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json({ flows: rows.map(serializeFlow) })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await req.json()) as {
      name?: string
      template_slug?: string
    }

    if (body.template_slug) {
      const tpl = getFlowTemplate(body.template_slug)
      if (!tpl) {
        return NextResponse.json({ error: 'Unknown template' }, { status: 400 })
      }
      const flow = await prisma.flow.create({
        data: {
          accountId: ctx.accountId,
          userId: ctx.userId,
          name: tpl.name,
          description: tpl.description,
          status: 'draft',
          triggerType: tpl.trigger_type,
          triggerConfig: tpl.trigger_config as Prisma.InputJsonValue,
          entryNodeId: tpl.entry_node_id,
          fallbackPolicy: DEFAULT_FALLBACK_POLICY as unknown as Prisma.InputJsonValue,
          nodes: {
            create: tpl.nodes.map((n, i) => ({
              nodeKey: n.node_key,
              nodeType: n.node_type,
              config: n.config as Prisma.InputJsonValue,
              positionX: 0,
              positionY: i * 80,
            })),
          },
        },
        include: { nodes: true },
      })
      return NextResponse.json({ flow: serializeFlow(flow) }, { status: 201 })
    }

    const name = body.name?.trim() || 'Novo flow'
    const flow = await prisma.flow.create({
      data: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        name,
        status: 'draft',
        triggerType: 'keyword',
        triggerConfig: { keywords: ['oi'], match_type: 'contains' },
        entryNodeId: 'start',
        nodes: {
          create: [
            {
              nodeKey: 'start',
              nodeType: 'start',
              config: { next_node_key: 'msg_1' },
              positionY: 0,
            },
            {
              nodeKey: 'msg_1',
              nodeType: 'send_message',
              config: {
                text: 'Olá! Como posso ajudar?',
                next_node_key: 'end',
              },
              positionY: 80,
            },
            {
              nodeKey: 'end',
              nodeType: 'end',
              config: {},
              positionY: 160,
            },
          ],
        },
      },
      include: { nodes: true },
    })
    return NextResponse.json({ flow: serializeFlow(flow) }, { status: 201 })
  } catch (err) {
    if (err instanceof Response) return err
    console.error('[api/flows POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
