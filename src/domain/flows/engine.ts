import { Prisma } from '@prisma/client'
import { prisma } from '@/domain/db/prisma'
import { engineSendText } from '@/domain/flows/waha-send'
import { DEFAULT_FALLBACK_POLICY } from '@/domain/flows/types'

type NodeLike = {
  node_type: string
  config: Record<string, unknown>
}

export function matchReplyId(node: NodeLike, replyId: string): string | null {
  if (node.node_type === 'send_buttons') {
    const buttons =
      (node.config.buttons as Array<{
        reply_id: string
        next_node_key: string
      }>) ?? []
    return buttons.find((b) => b.reply_id === replyId)?.next_node_key ?? null
  }
  if (node.node_type === 'send_list') {
    const sections =
      (node.config.sections as Array<{
        rows?: Array<{ reply_id: string; next_node_key: string }>
      }>) ?? []
    for (const sec of sections) {
      for (const row of sec.rows ?? []) {
        if (row.reply_id === replyId) return row.next_node_key
      }
    }
  }
  return null
}

export function matchesKeywordTrigger(
  text: string,
  cfg: {
    keywords?: string[]
    match_type?: 'contains' | 'exact'
    case_sensitive?: boolean
  },
): boolean {
  if (!text) return false
  const keywords = (cfg.keywords ?? []).filter(Boolean)
  if (!keywords.length) return false
  const hay = cfg.case_sensitive ? text : text.toLowerCase()
  for (const kw of keywords) {
    const needle = cfg.case_sensitive ? kw : kw.toLowerCase()
    if (!needle) continue
    if (cfg.match_type === 'exact') {
      if (hay === needle) return true
    } else if (hay.includes(needle)) {
      return true
    }
  }
  return false
}

export function isAutoAdvancing(t: string) {
  return ['start', 'send_message', 'send_media', 'condition', 'set_tag'].includes(
    t,
  )
}

export function isSuspending(t: string) {
  return ['send_buttons', 'send_list', 'collect_input'].includes(t)
}

export function isTerminal(t: string) {
  return ['handoff', 'end'].includes(t)
}

export function evaluateConditionPredicate(args: {
  operator: string
  subjectValue: string | undefined
  configValue: string | undefined
}): boolean {
  const { operator, subjectValue, configValue } = args
  if (operator === 'present')
    return Boolean(subjectValue && subjectValue.length > 0)
  if (operator === 'absent')
    return !(subjectValue && subjectValue.length > 0)
  if (operator === 'equals') {
    if (subjectValue === undefined) return false
    return subjectValue === configValue
  }
  if (operator === 'contains') {
    if (subjectValue === undefined) return false
    return subjectValue.includes(configValue ?? '')
  }
  return false
}

function interpolate(
  text: string,
  vars: Record<string, unknown>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key]
    return v == null ? '' : String(v)
  })
}

async function appendEvent(
  flowRunId: string,
  eventType: string,
  nodeKey: string | null,
  payload: Record<string, unknown> = {},
) {
  await prisma.flowRunEvent.create({
    data: {
      flowRunId,
      eventType,
      nodeKey,
      payload: payload as Prisma.InputJsonValue,
    },
  })
}

export async function advanceFlow(runId: string): Promise<{ ok: boolean }> {
  const run = await prisma.flowRun.findUnique({
    where: { id: runId },
    include: {
      flow: { include: { nodes: true } },
    },
  })
  if (!run || !run.flow) return { ok: false }
  if (!['active', 'waiting'].includes(run.status)) return { ok: true }

  const nodesByKey = new Map(
    run.flow.nodes.map((n) => [
      n.nodeKey,
      {
        id: n.id,
        node_key: n.nodeKey,
        node_type: n.nodeType,
        config: n.config as Record<string, unknown>,
      },
    ]),
  )

  let currentKey =
    run.currentNodeKey ??
    run.flow.entryNodeId ??
    run.flow.nodes.find((n) => n.nodeType === 'start')?.nodeKey ??
    null

  const contact = run.contactId
    ? await prisma.contact.findUnique({ where: { id: run.contactId } })
    : null
  const phone = contact?.phoneNormalized || contact?.phone || ''
  const accountId = run.accountId ?? run.flow.accountId
  let vars = (run.vars as Record<string, unknown>) ?? {}

  for (let i = 0; i < 20; i++) {
    if (!currentKey) break
    const node = nodesByKey.get(currentKey)
    if (!node) {
      await prisma.flowRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          endReason: 'missing_node',
          endedAt: new Date(),
        },
      })
      await appendEvent(runId, 'error', currentKey, { reason: 'missing_node' })
      return { ok: false }
    }

    if (isTerminal(node.node_type)) {
      await prisma.flowRun.update({
        where: { id: runId },
        data: {
          status: node.node_type === 'handoff' ? 'handed_off' : 'completed',
          currentNodeKey: currentKey,
          endReason: node.node_type,
          endedAt: new Date(),
          lastAdvancedAt: new Date(),
          vars: vars as Prisma.InputJsonValue,
        },
      })
      await appendEvent(runId, 'end', currentKey, { type: node.node_type })
      return { ok: true }
    }

    if (isSuspending(node.node_type)) {
      await prisma.flowRun.update({
        where: { id: runId },
        data: {
          status: 'waiting',
          currentNodeKey: currentKey,
          lastAdvancedAt: new Date(),
          vars: vars as Prisma.InputJsonValue,
        },
      })
      await appendEvent(runId, 'suspend', currentKey, {
        node_type: node.node_type,
      })
      return { ok: true }
    }

    if (node.node_type === 'send_message') {
      const text = interpolate(String(node.config.text ?? ''), vars)
      try {
        if (phone) {
          await engineSendText({ accountId, phone, text })
        }
        await appendEvent(runId, 'send_message', currentKey, { text })
      } catch (err) {
        await prisma.flowRun.update({
          where: { id: runId },
          data: {
            status: 'failed',
            endReason: 'send_failed',
            endedAt: new Date(),
            currentNodeKey: currentKey,
          },
        })
        await appendEvent(runId, 'error', currentKey, {
          message: err instanceof Error ? err.message : 'send failed',
        })
        return { ok: false }
      }
      currentKey = String(node.config.next_node_key ?? '') || null
      await prisma.flowRun.update({
        where: { id: runId },
        data: {
          currentNodeKey: currentKey,
          lastAdvancedAt: new Date(),
          vars: vars as Prisma.InputJsonValue,
          status: 'active',
        },
      })
      continue
    }

    if (node.node_type === 'start' || node.node_type === 'set_tag') {
      currentKey = String(node.config.next_node_key ?? '') || null
      await prisma.flowRun.update({
        where: { id: runId },
        data: {
          currentNodeKey: currentKey,
          lastAdvancedAt: new Date(),
        },
      })
      await appendEvent(runId, 'advance', node.node_key, {
        node_type: node.node_type,
      })
      continue
    }

    if (node.node_type === 'condition') {
      const subject = String(
        vars[String(node.config.subject ?? '')] ?? '',
      )
      const ok = evaluateConditionPredicate({
        operator: String(node.config.operator ?? 'present'),
        subjectValue: subject || undefined,
        configValue:
          node.config.value != null ? String(node.config.value) : undefined,
      })
      currentKey = ok
        ? String(node.config.yes_node_key ?? node.config.next_node_key ?? '') ||
          null
        : String(node.config.no_node_key ?? '') || null
      continue
    }

    if (node.node_type === 'send_media') {
      currentKey = String(node.config.next_node_key ?? '') || null
      continue
    }

    // Unknown auto node — stop safely
    await prisma.flowRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        endReason: 'unknown_node',
        endedAt: new Date(),
        currentNodeKey: currentKey,
      },
    })
    return { ok: false }
  }

  return { ok: true }
}

export async function dispatchInboundToFlows(args: {
  accountId: string
  contactId: string
  conversationId: string
  phone: string
  text: string
  isFirstInbound?: boolean
}): Promise<{ started: number; advanced: number }> {
  let started = 0
  let advanced = 0

  const waiting = await prisma.flowRun.findMany({
    where: {
      contactId: args.contactId,
      status: 'waiting',
      flow: { accountId: args.accountId, status: 'active' },
    },
    include: { flow: { include: { nodes: true } } },
  })

  for (const run of waiting) {
    const node = run.flow.nodes.find((n) => n.nodeKey === run.currentNodeKey)
    if (!node) continue
    const next = matchReplyId(
      {
        node_type: node.nodeType,
        config: node.config as Record<string, unknown>,
      },
      args.text.trim(),
    )
    if (next) {
      await prisma.flowRun.update({
        where: { id: run.id },
        data: { currentNodeKey: next, status: 'active' },
      })
      await advanceFlow(run.id)
      advanced++
    }
  }

  const flows = await prisma.flow.findMany({
    where: {
      accountId: args.accountId,
      status: 'active',
      triggerType: { in: ['keyword', 'first_inbound_message'] },
    },
    include: { nodes: true },
  })

  for (const flow of flows) {
    const activeExisting = await prisma.flowRun.findFirst({
      where: {
        flowId: flow.id,
        contactId: args.contactId,
        status: { in: ['active', 'waiting'] },
      },
    })
    if (activeExisting) continue

    const cfg = flow.triggerConfig as {
      keywords?: string[]
      match_type?: 'contains' | 'exact'
      case_sensitive?: boolean
    }

    let match = false
    if (flow.triggerType === 'keyword') {
      match = matchesKeywordTrigger(args.text, cfg)
    } else if (flow.triggerType === 'first_inbound_message') {
      match = Boolean(args.isFirstInbound)
    }
    if (!match) continue

    const entry =
      flow.entryNodeId ??
      flow.nodes.find((n) => n.nodeType === 'start')?.nodeKey ??
      null

    const run = await prisma.flowRun.create({
      data: {
        flowId: flow.id,
        accountId: args.accountId,
        contactId: args.contactId,
        conversationId: args.conversationId,
        status: 'active',
        currentNodeKey: entry,
        vars: {},
      },
    })

    await prisma.flow.update({
      where: { id: flow.id },
      data: {
        executionCount: { increment: 1 },
        lastExecutedAt: new Date(),
      },
    })

    await appendEvent(run.id, 'started', entry, {
      trigger: flow.triggerType,
      text: args.text,
    })

    await advanceFlow(run.id)
    started++
  }

  return { started, advanced }
}

export { DEFAULT_FALLBACK_POLICY }
export default advanceFlow
