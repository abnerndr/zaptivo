import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import { serializeAutomation } from '@/lib/automations/serialize'
import {
  AUTOMATION_TEMPLATES,
  type TemplateSlug,
} from '@/lib/automations/templates'

export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const rows = await prisma.automation.findMany({
      where: { accountId: ctx.accountId },
      include: { steps: true },
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json({
      automations: rows.map(serializeAutomation),
    })
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
      description?: string
      trigger_type?: string
      trigger_config?: Record<string, unknown>
      steps?: Array<{
        step_type: string
        step_config: Record<string, unknown>
        position?: number
      }>
      template_slug?: string
    }

    let name = body.name?.trim()
    let description = body.description ?? null
    let triggerType = body.trigger_type
    let triggerConfig = body.trigger_config ?? {}
    let steps = body.steps ?? []

    if (body.template_slug) {
      const tpl =
        AUTOMATION_TEMPLATES[body.template_slug as TemplateSlug]
      if (!tpl) {
        return NextResponse.json(
          { error: 'Unknown template_slug' },
          { status: 400 },
        )
      }
      name = name || tpl.name
      description = description ?? tpl.description
      triggerType = tpl.trigger_type
      triggerConfig = tpl.trigger_config as Record<string, unknown>
      steps = tpl.steps
        .map((s, i) => ({
          step_type: s.step_type,
          step_config: s.step_config as Record<string, unknown>,
          position: i,
          parent_index: s.parent_index,
        }))
        .filter((s) => s.parent_index == null)
        .map((s, i) => ({
          step_type: s.step_type,
          step_config: s.step_config,
          position: i,
        }))
    }

    if (!name || !triggerType) {
      return NextResponse.json(
        { error: 'name and trigger_type required' },
        { status: 400 },
      )
    }

    const automation = await prisma.automation.create({
      data: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        name,
        description,
        triggerType,
        triggerConfig: triggerConfig as Prisma.InputJsonValue,
        isActive: false,
        steps: {
          create: steps.map((s, i) => ({
            stepType: s.step_type,
            stepConfig: s.step_config as Prisma.InputJsonValue,
            position: s.position ?? i,
          })),
        },
      },
      include: { steps: true },
    })

    return NextResponse.json(
      { automation: serializeAutomation(automation) },
      { status: 201 },
    )
  } catch (err) {
    if (err instanceof Response) return err
    console.error('[api/automations POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
