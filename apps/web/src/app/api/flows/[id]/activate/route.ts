import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import { serializeFlow } from '@/lib/flows/serialize'
import { validateFlowForActivation } from '@/lib/flows/validate'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const body = (await req.json().catch(() => ({}))) as { active?: boolean }
    const active = body.active !== false

    const flow = await prisma.flow.findFirst({
      where: { id, accountId: session.accountId },
      include: { nodes: true },
    })
    if (!flow) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (active) {
      const issues = validateFlowForActivation(
        {
          name: flow.name,
          trigger_type: flow.triggerType as
            | 'keyword'
            | 'first_inbound_message'
            | 'manual',
          trigger_config: flow.triggerConfig as Record<string, unknown>,
          entry_node_id: flow.entryNodeId,
        },
        flow.nodes.map((n) => ({
          node_key: n.nodeKey,
          node_type: n.nodeType,
          config: n.config as Record<string, unknown>,
        })),
      ).filter((i) => i.severity === 'error')
      if (issues.length > 0) {
        return NextResponse.json({ errors: issues }, { status: 400 })
      }
    }

    const updated = await prisma.flow.update({
      where: { id },
      data: { status: active ? 'active' : 'draft' },
      include: { nodes: true },
    })
    return NextResponse.json({ flow: serializeFlow(updated) })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
