'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'

export function useUnreadNotifications() {
  const { accountId } = useAuth()
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!accountId) {
      setCount(0)
      return
    }
    const res = await fetch('/api/notifications/unread-count')
    if (!res.ok) return
    const data = (await res.json()) as { count: number }
    setCount(data.count)
  }, [accountId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useRealtime(accountId, (payload) => {
    if (payload.table === 'notifications') void refresh()
  })

  return { count, refresh }
}
