'use client'

import { useEffect, useRef, useState } from 'react'

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
 * Returns whether the stream is currently connected.
 *
 * Note: browsers may fire `onerror` transiently; we only mark disconnected
 * after the socket is closed, and mark connected again on the next `onopen`.
 */
export function useRealtime(
  accountId: string | null | undefined,
  onEvent: (payload: RealtimePayload) => void,
): boolean {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!accountId) {
      setConnected(false)
      return
    }

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
        setConnected(true)
      }
      es.onmessage = (ev) => {
        setConnected(true)
        try {
          const payload = JSON.parse(ev.data) as RealtimePayload
          if (payload.type === 'ping' || payload.type === 'ready') return
          handlerRef.current(payload)
        } catch {
          /* ignore malformed */
        }
      }
      es.onerror = () => {
        // Keep connected=true during brief blips; only flip off if CLOSED
        if (es?.readyState === EventSource.CLOSED) {
          setConnected(false)
        }
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
      setConnected(false)
    }
  }, [accountId])

  return connected
}

