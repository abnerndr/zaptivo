'use client'
import { apiFetch } from '@/lib/api/client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bell,
  CheckCheck,
  Inbox,
  Loader2,
  MessageSquare,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import { useUnreadNotifications } from '@/hooks/use-unread-notifications'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type NotificationRow = {
  id: string
  type: string
  conversation_id: string | null
  title: string
  body: string | null
  read_at: string | null
  created_at: string
}

function relativeTime(
  iso: string,
  t: (key: 'timeS' | 'timeM' | 'timeH' | 'timeD', values: Record<string, number>) => string,
): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return t('timeS', { sec: Math.max(1, diffSec) })
  if (diffSec < 3600) return t('timeM', { min: Math.floor(diffSec / 60) })
  if (diffSec < 86400) return t('timeH', { hr: Math.floor(diffSec / 3600) })
  if (diffSec < 2_592_000) return t('timeD', { day: Math.floor(diffSec / 86400) })
  return new Date(iso).toLocaleDateString()
}

export default function NotificationsPage() {
  const t = useTranslations('Notifications')
  const router = useRouter()
  const { accountId } = useAuth()
  const { refresh: refreshUnread } = useUnreadNotifications()

  const [items, setItems] = useState<NotificationRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/notifications?limit=50', {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as { notifications: NotificationRow[] }
      setItems(data.notifications)
    } catch {
      setItems([])
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  useRealtime(accountId, (payload) => {
    if (payload.table === 'notifications') void load()
  })

  const unreadCount = items?.filter((n) => !n.read_at).length ?? 0

  async function markRead(ids: string[]) {
    if (ids.length === 0) return
    setItems((prev) =>
      prev
        ? prev.map((n) =>
            ids.includes(n.id)
              ? { ...n, read_at: n.read_at ?? new Date().toISOString() }
              : n,
          )
        : prev,
    )
    const res = await apiFetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (!res.ok) {
      await load()
      return
    }
    await refreshUnread()
  }

  async function markAllRead() {
    if (unreadCount === 0) return
    setMarkingAll(true)
    try {
      const res = await apiFetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      if (!res.ok) {
        toast.error(t('markAllFailed'))
        return
      }
      setItems((prev) =>
        prev
          ? prev.map((n) => ({
              ...n,
              read_at: n.read_at ?? new Date().toISOString(),
            }))
          : prev,
      )
      await refreshUnread()
      toast.success(t('markAllSuccess'))
    } finally {
      setMarkingAll(false)
    }
  }

  async function openNotification(n: NotificationRow) {
    if (!n.read_at) await markRead([n.id])
    router.push('/inbox')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || unreadCount === 0 || markingAll}
          onClick={() => void markAllRead()}
        >
          {markingAll ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <CheckCheck className="mr-2 size-4" />
          )}
          {t('markAllRead')}
        </Button>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        {loading || !items ? (
          <div className="flex items-center gap-2 px-5 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('loading')}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Bell className="size-5" />
            </div>
            <p className="text-sm font-medium text-foreground">{t('emptyTitle')}</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {t('emptyHint')}
            </p>
            <Link
              href="/inbox"
              className="mt-1 inline-flex items-center text-sm font-medium text-primary hover:underline"
            >
              <Inbox className="mr-1.5 size-4" />
              {t('goInbox')}
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => {
              const unread = !n.read_at
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void openNotification(n)}
                    className={cn(
                      'flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/50',
                      unread && 'bg-primary/5',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                        unread
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <MessageSquare className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <span
                          className={cn(
                            'text-sm text-foreground',
                            unread ? 'font-semibold' : 'font-medium',
                          )}
                        >
                          {n.title}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {relativeTime(n.created_at, t)}
                        </span>
                      </span>
                      {n.body ? (
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          {n.body}
                        </span>
                      ) : null}
                      {unread ? (
                        <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                          <span className="size-1.5 rounded-full bg-primary" />
                          {t('unread')}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
