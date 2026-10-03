import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'
import { serializeAutomation } from '@/domain/automations/serialize'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.automation.findFirst({
      where: { id, accountId: session.accountId },
      include: { steps: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const clone = await prisma.automation.create({
      data: {
        accountId: session.accountId,
        userId: session.userId,
        name: `${existing.name} (copy)`,
        description: existing.description,
        triggerType: existing.triggerType,
        triggerConfig: existing.triggerConfig as Prisma.InputJsonValue,
        isActive: false,
        steps: {
          create: existing.steps
            .filter((s) => !s.parentStepId)
            .sort((a, b) => a.position - b.position)
            .map((s, i) => ({
              stepType: s.stepType,
              stepConfig: s.stepConfig as Prisma.InputJsonValue,
              position: i,
            })),
        },
      },
      include: { steps: true },
    })
    return NextResponse.json(
      { automation: serializeAutomation(clone) },
      { status: 201 },
    )
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
