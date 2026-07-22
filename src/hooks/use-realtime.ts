'use client'

import { useEffect, useRef } from 'react'

export type RealtimePayload = {
  type?: string
  table?: string
  op?: string
  id?: string
  accountId?: string
}

/**
 * Subscribe to account-scoped SSE (`/api/realtime/stream`).
 * Auto-reconnects with backoff when the stream drops.
 */
export function useRealtime(
  accountId: string | null | undefined,
  onEvent: (payload: RealtimePayload) => void,
) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    if (!accountId) return

    let es: EventSource | null = null
    let stopped = false
    let retryMs = 1000
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (stopped) return
      es = new EventSource(
        `/api/realtime/stream?accountId=${encodeURIComponent(accountId)}`,
      )
      es.onopen = () => {
        retryMs = 1000
      }
      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data) as RealtimePayload
          if (payload.type === 'ping' || payload.type === 'ready') return
          handlerRef.current(payload)
        } catch {
          /* ignore malformed */
        }
      }
      es.onerror = () => {
        es?.close()
        es = null
        if (stopped) return
        retryTimer = setTimeout(() => {
          retryMs = Math.min(retryMs * 2, 15000)
          connect()
        }, retryMs)
      }
    }

    connect()

    return () => {
      stopped = true
      if (retryTimer) clearTimeout(retryTimer)
      es?.close()
    }
  }, [accountId])
}
