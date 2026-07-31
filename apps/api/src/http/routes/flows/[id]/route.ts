import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import { serializeFlow } from '@/lib/flows/serialize'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const flow = await prisma.flow.findFirst({
      where: { id, accountId: session.accountId },
      include: { nodes: true },
    })
    if (!flow) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ flow: serializeFlow(flow) })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.flow.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const body = (await req.json()) as {
      name?: string
      description?: string | null
      trigger_type?: string
      trigger_config?: Record<string, unknown>
      entry_node_id?: string | null
      nodes?: Array<{
        node_key: string
        node_type: string
        config: Record<string, unknown>
        position_x?: number
        position_y?: number
      }>
    }

    const flow = await prisma.$transaction(async (tx) => {
      if (body.nodes) {
        await tx.flowNode.deleteMany({ where: { flowId: id } })
        if (body.nodes.length > 0) {
          await tx.flowNode.createMany({
            data: body.nodes.map((n, i) => ({
              flowId: id,
              nodeKey: n.node_key,
              nodeType: n.node_type,
              config: n.config as Prisma.InputJsonValue,
              positionX: n.position_x ?? 0,
              positionY: n.position_y ?? i * 80,
            })),
          })
        }
      }
      return tx.flow.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.description !== undefined
            ? { description: body.description }
            : {}),
          ...(body.trigger_type ? { triggerType: body.trigger_type } : {}),
          ...(body.trigger_config
            ? {
                triggerConfig: body.trigger_config as Prisma.InputJsonValue,
              }
            : {}),
          ...(body.entry_node_id !== undefined
            ? { entryNodeId: body.entry_node_id }
            : {}),
        },
        include: { nodes: true },
      })
    })

    return NextResponse.json({ flow: serializeFlow(flow) })
  } catch (err) {
    if (err instanceof Response) return err
    console.error('[api/flows PUT]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.flow.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.flow.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
