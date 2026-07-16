'use client'

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useRealtime } from "@/hooks/use-realtime"

export function useUnreadNotifications() {
  const { accountId } = useAuth()
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!accountId) {
      setCount(0)
      return
    }
    const res = await fetch("/api/notifications/unread-count")
    if (!res.ok) return
    const data = (await res.json()) as { count: number }
    setCount(data.count)
  }, [accountId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useRealtime(accountId, (payload) => {
    if (payload.table === "notifications") void refresh()
  })

  // Number-like for legacy `unread > 0` usages via valueOf, plus .count/.refresh
  const result = Object.assign(Object.create(Number.prototype), {
    count,
    refresh,
    valueOf() {
      return count
    },
    toString() {
      return String(count)
    },
  }) as number & { count: number; refresh: () => Promise<void> }

  // Simpler: just return count as primary — sidebar may use wrong shape.
  // Return object; we'll patch sidebar instead.
  return { count, refresh }
}
