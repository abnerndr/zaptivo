'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Briefcase,
  MessageSquare,
  MessagesSquare,
  UserPlus,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/lib/dashboard/types'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { MetricCard } from '@/components/dashboard/metric-card'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { SkeletonCard } from '@/components/dashboard/skeleton'

type RangeDays = 7 | 30 | 90

type DashboardData = {
  metrics: MetricsBundle
  conversationsSeries: Record<RangeDays, ConversationsSeriesPoint[]>
  pipeline: PipelineDonutData
  responseTime: ResponseTimeSummary
  activity: ActivityItem[]
}

function deltaLabel(
  current: number,
  previous: number,
  noChange: string,
  suffix: string,
): { sign: number; label: string } {
  const diff = current - previous
  if (diff === 0) {
    return { sign: 0, label: noChange }
  }
  const sign = diff > 0 ? 1 : -1
  const abs = Math.abs(diff)
  return {
    sign,
    label: `${diff > 0 ? '+' : '−'}${abs} ${suffix}`,
  }
}

export default function DashboardPage() {
  const t = useTranslations('Dashboard.page')
  const { defaultCurrency } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<RangeDays>(7)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' })
      if (!res.ok) throw new Error('failed')
      const json = (await res.json()) as DashboardData
      setData(json)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const metrics = data?.metrics
  const series = data?.conversationsSeries ?? {
    7: null,
    30: null,
    90: null,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <QuickActions />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !metrics ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <MetricCard
              title={t('activeConversations')}
              value={String(metrics.activeConversations.current)}
              icon={MessagesSquare}
              delta={deltaLabel(
                metrics.activeConversations.current,
                metrics.activeConversations.previous,
                t('noChange', { suffix: t('vsYesterday') }),
                t('vsYesterday'),
              )}
            />
            <MetricCard
              title={t('newContactsToday')}
              value={String(metrics.newContactsToday.current)}
              icon={UserPlus}
              delta={deltaLabel(
                metrics.newContactsToday.current,
                metrics.newContactsToday.previous,
                t('noChange', { suffix: t('newTodayVsYesterday') }),
                t('newTodayVsYesterday'),
              )}
            />
            <MetricCard
              title={t('openDealsValue')}
              value={formatCurrency(
                metrics.openDealsValue,
                defaultCurrency,
              )}
              icon={Briefcase}
              subtitle={t('openDeals', { count: metrics.openDealsCount })}
            />
            <MetricCard
              title={t('messagesSentToday')}
              value={String(metrics.messagesSentToday.current)}
              icon={MessageSquare}
              delta={deltaLabel(
                metrics.messagesSentToday.current,
                metrics.messagesSentToday.previous,
                t('noChange', { suffix: t('vsYesterday') }),
                t('vsYesterday'),
              )}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ConversationsChart
          series={series}
          loading={loading}
          range={range}
          onRangeChange={setRange}
        />
        <PipelineDonut
          data={data?.pipeline ?? null}
          loading={loading}
          currency={defaultCurrency}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <ResponseTimeChart
          data={data?.responseTime ?? null}
          loading={loading}
        />
        <ActivityFeed items={data?.activity ?? null} loading={loading} />
      </div>
    </div>
  )
}
