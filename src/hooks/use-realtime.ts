"use client";

import { useEffect, useRef } from "react";

export type RealtimePayload = {
  type?: string;
  table?: string;
  op?: string;
  id?: string;
  accountId?: string;
};

/**
 * Subscribe to account-scoped SSE (`/api/realtime/stream`).
 * Replaces Supabase postgres_changes channels.
 */
export function useRealtime(
  accountId: string | null | undefined,
  onEvent: (payload: RealtimePayload) => void,
) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!accountId) return;
    const es = new EventSource(
      `/api/realtime/stream?accountId=${encodeURIComponent(accountId)}`,
    );
    es.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data) as RealtimePayload;
        if (payload.type === "ping" || payload.type === "ready") return;
        handlerRef.current(payload);
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => {
      // Browser will retry EventSource automatically in most cases
    };
    return () => es.close();
  }, [accountId]);
}
