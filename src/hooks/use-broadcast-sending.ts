'use client'
export function useBroadcastSending() {
  return {
    sending: false,
    progress: 0,
    start: async () => ({ ok: false as const, error: "Broadcast UI em migração" }),
  }
}
