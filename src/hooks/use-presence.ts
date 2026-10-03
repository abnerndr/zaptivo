'use client'
import { apiFetch } from '@/lib/api/client'

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useRealtime } from "@/hooks/use-realtime"

export type PresenceStatus = "online" | "away" | "offline"
export type PresenceRow = {
  user_id: string
  status: string
  last_seen_at: string
}

const STALE_MS = 90_000

export function usePresence() {
  const { accountId } = useAuth()
  const [rows, setRows] = useState<PresenceRow[]>([])
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    if (!accountId) {
      setRows([])
      return
    }
    const res = await apiFetch("/api/presence")
    if (!res.ok) return
    const data = (await res.json()) as { presence: PresenceRow[] }
    setRows(data.presence)
    setNow(Date.now())
  }, [accountId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useRealtime(accountId, (payload) => {
    if (payload.table === "member_presence") void refresh()
  })

  const getRow = useCallback(
    (userId: string) => rows.find((r) => r.user_id === userId) ?? null,
    [rows]
  )

  const getPresence = useCallback(
    (userId: string): PresenceStatus => {
      const row = getRow(userId)
      if (!row) return "offline"
      const age = now - new Date(row.last_seen_at).getTime()
      if (age > STALE_MS) return "offline"
      return row.status === "away" ? "away" : "online"
    },
    [getRow, now]
  )

  return { presence: rows, refresh, getPresence, getRow, now }
}
