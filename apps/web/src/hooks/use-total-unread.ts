"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";

export function useTotalUnread() {
  const { accountId } = useAuth();
  const [total, setTotal] = useState(0);

  const refresh = useCallback(async () => {
    if (!accountId) {
      setTotal(0);
      return;
    }
    const res = await fetch("/api/inbox/conversations");
    if (!res.ok) return;
    const data = (await res.json()) as {
      conversations: Array<{ unread_count: number }>;
    };
    setTotal(
      data.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0),
    );
  }, [accountId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtime(accountId, (payload) => {
    if (payload.table === "conversations" || payload.table === "messages") {
      void refresh();
    }
  });

  return total;
}
