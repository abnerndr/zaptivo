import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import { serializeAutomation } from '@/lib/automations/serialize'
import {
  validateStepsForActivation,
  validateTriggerForActivation,
} from '@/lib/automations/validate'
import type { AutomationTriggerType } from '@/types'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const automation = await prisma.automation.findFirst({
      where: { id, accountId: session.accountId },
      include: { steps: true },
    })
    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({
      automation: serializeAutomation(automation),
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.automation.findFirst({
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
      is_active?: boolean
      steps?: Array<{
        step_type: string
        step_config: Record<string, unknown>
        position?: number
      }>
    }

    const name = body.name?.trim() ?? existing.name
    const triggerType = body.trigger_type ?? existing.triggerType
    const triggerConfig =
      body.trigger_config ??
      (existing.triggerConfig as Record<string, unknown>)
    const isActive = body.is_active ?? existing.isActive

    const effectiveSteps =
      body.steps ??
      (
        await prisma.automationStep.findMany({
          where: { automationId: id },
          orderBy: { position: 'asc' },
        })
      ).map((s) => ({
        step_type: s.stepType,
        step_config: s.stepConfig as Record<string, unknown>,
      }))

    if (isActive) {
      const allIssues = [
        ...validateStepsForActivation(effectiveSteps),
        ...validateTriggerForActivation(
          triggerType as AutomationTriggerType,
          triggerConfig,
        ),
      ]
      if (allIssues.length > 0) {
        return NextResponse.json({ errors: allIssues }, { status: 400 })
      }
    }

    const automation = await prisma.$transaction(async (tx) => {
      if (body.steps) {
        await tx.automationStep.deleteMany({ where: { automationId: id } })
        if (body.steps.length > 0) {
          await tx.automationStep.createMany({
            data: body.steps.map((s, i) => ({
              automationId: id,
              stepType: s.step_type,
              stepConfig: s.step_config as Prisma.InputJsonValue,
              position: s.position ?? i,
            })),
          })
        }
      }
      return tx.automation.update({
        where: { id },
        data: {
          name,
          description:
            body.description !== undefined
              ? body.description
              : existing.description,
          triggerType,
          triggerConfig: triggerConfig as Prisma.InputJsonValue,
          isActive,
        },
        include: { steps: true },
      })
    })

    return NextResponse.json({
      automation: serializeAutomation(automation),
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error('[api/automations PUT]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount()
    const { id } = await ctx.params
    const existing = await prisma.automation.findFirst({
      where: { id, accountId: session.accountId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.automation.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
