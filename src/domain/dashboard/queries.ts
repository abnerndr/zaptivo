import { prisma } from '@/domain/db/prisma'
import {
  daysAgoStart,
  lastNDayKeys,
  localDayKey,
  mondayIndex,
  startOfLocalDay,
} from '@/domain/dashboard/date-utils'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/domain/dashboard/types'

export type DashboardPayload = {
  metrics: MetricsBundle
  conversationsSeries: Record<7 | 30 | 90, ConversationsSeriesPoint[]>
  pipeline: PipelineDonutData
  responseTime: ResponseTimeSummary
  activity: ActivityItem[]
}

function dayBounds(offsetDays: number): { start: Date; end: Date } {
  const start = startOfLocalDay()
  start.setDate(start.getDate() - offsetDays)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

export async function getDashboardMetrics(
  accountId: string,
): Promise<MetricsBundle> {
  const today = dayBounds(0)
  const yesterday = dayBounds(1)

  const [
    activeConversations,
    contactsToday,
    contactsYesterday,
    openDeals,
    messagesToday,
    messagesYesterday,
  ] = await Promise.all([
    prisma.conversation.count({
      where: {
        accountId,
        status: { in: ['open', 'pending'] },
      },
    }),
    prisma.contact.count({
      where: { accountId, createdAt: { gte: today.start, lt: today.end } },
    }),
    prisma.contact.count({
      where: {
        accountId,
        createdAt: { gte: yesterday.start, lt: yesterday.end },
      },
    }),
    prisma.deal.findMany({
      where: {
        status: 'open',
        pipeline: { accountId },
      },
      select: { value: true },
    }),
    prisma.message.count({
      where: {
        createdAt: { gte: today.start, lt: today.end },
        senderType: { in: ['agent', 'bot'] },
        conversation: { accountId },
      },
    }),
    prisma.message.count({
      where: {
        createdAt: { gte: yesterday.start, lt: yesterday.end },
        senderType: { in: ['agent', 'bot'] },
        conversation: { accountId },
      },
    }),
  ])

  // Approximate "yesterday's active" as open/pending that already existed
  // before today — delta then reflects net new open threads today.
  const activeYesterday = await prisma.conversation.count({
    where: {
      accountId,
      status: { in: ['open', 'pending'] },
      createdAt: { lt: today.start },
    },
  })

  const openDealsValue = openDeals.reduce(
    (sum, d) => sum + Number(d.value),
    0,
  )

  return {
    activeConversations: {
      current: activeConversations,
      previous: activeYesterday,
    },
    newContactsToday: {
      current: contactsToday,
      previous: contactsYesterday,
    },
    openDealsValue,
    openDealsCount: openDeals.length,
    messagesSentToday: {
      current: messagesToday,
      previous: messagesYesterday,
    },
  }
}

export async function getConversationsSeries(
  accountId: string,
): Promise<Record<7 | 30 | 90, ConversationsSeriesPoint[]>> {
  const since = daysAgoStart(89)
  const rows = await prisma.message.findMany({
    where: {
      createdAt: { gte: since },
      conversation: { accountId },
    },
    select: { createdAt: true, senderType: true },
  })

  const build = (n: 7 | 30 | 90): ConversationsSeriesPoint[] => {
    const keys = lastNDayKeys(n)
    const map = new Map(keys.map((k) => [k, { incoming: 0, outgoing: 0 }]))
    for (const row of rows) {
      const key = localDayKey(row.createdAt)
      const bucket = map.get(key)
      if (!bucket) continue
      if (row.senderType === 'customer') bucket.incoming += 1
      else bucket.outgoing += 1
    }
    return keys.map((day) => ({
      day,
      incoming: map.get(day)?.incoming ?? 0,
      outgoing: map.get(day)?.outgoing ?? 0,
    }))
  }

  return {
    7: build(7),
    30: build(30),
    90: build(90),
  }
}

export async function getPipelineDonut(
  accountId: string,
): Promise<PipelineDonutData> {
  const pipeline = await prisma.pipeline.findFirst({
    where: { accountId },
    orderBy: { createdAt: 'asc' },
    include: {
      stages: {
        orderBy: { position: 'asc' },
        include: {
          deals: {
            where: { status: 'open' },
            select: { value: true },
          },
        },
      },
    },
  })

  if (!pipeline) {
    return { stages: [], totalValue: 0 }
  }

  const stages = pipeline.stages
    .map((s) => {
      const totalValue = s.deals.reduce((sum, d) => sum + Number(d.value), 0)
      return {
        id: s.id,
        name: s.name,
        color: s.color || '#3b82f6',
        dealCount: s.deals.length,
        totalValue,
      }
    })
    .filter((s) => s.dealCount > 0)

  const totalValue = stages.reduce((sum, s) => sum + s.totalValue, 0)
  return { stages, totalValue }
}

/**
 * First-response samples: for each conversation, time between the
 * first customer message and the first agent/bot reply after it.
 * Bucketed by weekday of the reply (Mon=0 … Sun=6).
 */
export async function getResponseTimeSummary(
  accountId: string,
): Promise<ResponseTimeSummary> {
  const since = daysAgoStart(13)
  const thisWeekStart = daysAgoStart(6)
  const lastWeekStart = daysAgoStart(13)

  const conversations = await prisma.conversation.findMany({
    where: {
      accountId,
      messages: { some: { createdAt: { gte: since } } },
    },
    select: {
      id: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, senderType: true },
        take: 80,
      },
    },
    take: 400,
  })

  const buckets = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    avgMinutes: null as number | null,
    samples: 0,
    _sum: 0,
  }))

  let thisWeekSum = 0
  let thisWeekN = 0
  let lastWeekSum = 0
  let lastWeekN = 0

  for (const conv of conversations) {
    const firstCustomer = conv.messages.find((m) => m.senderType === 'customer')
    if (!firstCustomer) continue
    const firstReply = conv.messages.find(
      (m) =>
        (m.senderType === 'agent' || m.senderType === 'bot') &&
        m.createdAt > firstCustomer.createdAt,
    )
    if (!firstReply) continue

    const mins =
      (firstReply.createdAt.getTime() - firstCustomer.createdAt.getTime()) /
      60_000
    if (mins < 0 || mins > 24 * 60) continue

    const dow = mondayIndex(firstReply.createdAt)
    buckets[dow]._sum += mins
    buckets[dow].samples += 1

    if (firstReply.createdAt >= thisWeekStart) {
      thisWeekSum += mins
      thisWeekN += 1
    } else if (
      firstReply.createdAt >= lastWeekStart &&
      firstReply.createdAt < thisWeekStart
    ) {
      lastWeekSum += mins
      lastWeekN += 1
    }
  }

  return {
    buckets: buckets.map(({ dow, samples, _sum }) => ({
      dow,
      samples,
      avgMinutes: samples > 0 ? _sum / samples : null,
    })),
    thisWeekAvg: thisWeekN > 0 ? thisWeekSum / thisWeekN : null,
    lastWeekAvg: lastWeekN > 0 ? lastWeekSum / lastWeekN : null,
  }
}

export async function getActivityFeed(
  accountId: string,
  limit = 50,
): Promise<ActivityItem[]> {
  const since = daysAgoStart(30)

  const [messages, contacts, deals, broadcasts, automations] =
    await Promise.all([
      prisma.message.findMany({
        where: {
          createdAt: { gte: since },
          conversation: { accountId },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          createdAt: true,
          senderType: true,
          contentText: true,
          conversationId: true,
          conversation: {
            select: {
              contact: { select: { name: true, phone: true } },
            },
          },
        },
      }),
      prisma.contact.findMany({
        where: { accountId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, name: true, phone: true, createdAt: true },
      }),
      prisma.deal.findMany({
        where: { pipeline: { accountId }, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, title: true, createdAt: true, pipelineId: true },
      }),
      prisma.broadcast.findMany({
        where: { accountId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, createdAt: true, status: true },
      }),
      prisma.automation.findMany({
        where: { accountId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, createdAt: true },
      }),
    ])

  const items: ActivityItem[] = []

  for (const m of messages) {
    const who =
      m.conversation.contact.name ||
      m.conversation.contact.phone ||
      'contato'
    const preview = (m.contentText ?? '').trim().slice(0, 80)
    const direction =
      m.senderType === 'customer' ? `Mensagem de ${who}` : `Resposta para ${who}`
    items.push({
      id: `msg-${m.id}`,
      kind: 'message',
      text: preview ? `${direction}: ${preview}` : direction,
      at: m.createdAt.toISOString(),
      href: `/inbox`,
    })
  }

  for (const c of contacts) {
    items.push({
      id: `contact-${c.id}`,
      kind: 'contact',
      text: `Novo contato: ${c.name || c.phone}`,
      at: c.createdAt.toISOString(),
      href: `/contacts`,
    })
  }

  for (const d of deals) {
    items.push({
      id: `deal-${d.id}`,
      kind: 'deal',
      text: `Negócio criado: ${d.title}`,
      at: d.createdAt.toISOString(),
      href: `/pipelines`,
    })
  }

  for (const b of broadcasts) {
    items.push({
      id: `broadcast-${b.id}`,
      kind: 'broadcast',
      text: `Broadcast “${b.name}” (${b.status})`,
      at: b.createdAt.toISOString(),
      href: `/broadcasts`,
    })
  }

  for (const a of automations) {
    items.push({
      id: `auto-${a.id}`,
      kind: 'automation',
      text: `Automação “${a.name}”`,
      at: a.createdAt.toISOString(),
      href: `/automations`,
    })
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit)
}

export async function getDashboardData(
  accountId: string,
): Promise<DashboardPayload> {
  const [metrics, conversationsSeries, pipeline, responseTime, activity] =
    await Promise.all([
      getDashboardMetrics(accountId),
      getConversationsSeries(accountId),
      getPipelineDonut(accountId),
      getResponseTimeSummary(accountId),
      getActivityFeed(accountId),
    ])

  return {
    metrics,
    conversationsSeries,
    pipeline,
    responseTime,
    activity,
  }
}
