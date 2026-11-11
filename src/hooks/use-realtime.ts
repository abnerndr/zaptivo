'use client'

import { useEffect, useRef, useState } from 'react'
import type { RealtimePayload } from '@/domain/realtime/payload'

export type { RealtimePayload }

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
    // Message IDs are stable across duplicate INSERT notifications. Other
    // updates can legitimately reuse a row ID and must never be suppressed.
    const seenInserts = new Set<string>()

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
          if (payload.type === 'ping') return
          if (payload.type === 'ready') {
            // The listener is already active. Refresh each consumer's data on
            // initial connection and reconnect while no durable log exists.
            handlerRef.current({ type: 'reconnect' })
            for (const table of ['conversations', 'notifications', 'member_presence']) {
              handlerRef.current({ table })
            }
            return
          }
          if (payload.table === 'messages' && payload.op === 'INSERT' && payload.id && payload.conversationId) {
            if (seenInserts.has(payload.id)) return
            seenInserts.add(payload.id)
            if (seenInserts.size > 2000) seenInserts.delete(seenInserts.values().next().value!)
          }
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

