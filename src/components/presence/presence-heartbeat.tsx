"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

/** Heartbeat presence every 30s via /api/presence */
export function PresenceHeartbeat() {
  const { user, accountId } = useAuth();

  useEffect(() => {
    if (!user || !accountId) return;

    const beat = () => {
      void fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "online" }),
      });
    };

    beat();
    const id = setInterval(beat, 30_000);
    return () => clearInterval(id);
  }, [user, accountId]);

  return null;
}
