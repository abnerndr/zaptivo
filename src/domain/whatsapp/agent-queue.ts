export const AGENT_DEBOUNCE_MS = 4000
export const AGENT_LOCK_RETRY_MS = 1000

export function planEvolutionAgent(args: {
  fromMe: boolean
  source?: string | null
  duplicate: boolean
}): 'ignore' | 'takeover' | 'enqueue' {
  if (args.duplicate) return 'ignore'
  if (args.fromMe && args.source === 'api') return 'ignore'
  if (args.fromMe) return 'takeover'
  return 'enqueue'
}

export function createAgentScheduler(deps: {
  later: (ms: number, fn: () => void) => () => void
}): {
  schedule: (conversationId: string, delayMs: number, run: () => Promise<void>) => void
} {
  const timers = new Map<string, () => void>()
  const running = new Set<string>()

  const schedule = (
    conversationId: string,
    delayMs: number,
    run: () => Promise<void>,
  ) => {
    timers.get(conversationId)?.()
    const cancel = deps.later(delayMs, () => {
      timers.delete(conversationId)
      if (running.has(conversationId)) {
        schedule(conversationId, AGENT_LOCK_RETRY_MS, run)
        return
      }
      running.add(conversationId)
      void Promise.resolve()
        .then(run)
        .catch((err) => {
          console.warn('[agent]', err instanceof Error ? err.message : err)
        })
        .finally(() => {
          running.delete(conversationId)
        })
    })
    timers.set(conversationId, cancel)
  }

  return { schedule }
}

const scheduler = createAgentScheduler({
  later(ms, fn) {
    const id = setTimeout(fn, ms)
    return () => clearTimeout(id)
  },
})

export function scheduleAgentJob(
  conversationId: string,
  run: () => Promise<void>,
): void {
  scheduler.schedule(conversationId, AGENT_DEBOUNCE_MS, run)
}
