import { describe, expect, it } from 'vitest'
import {
  AGENT_DEBOUNCE_MS,
  createAgentScheduler,
  planEvolutionAgent,
} from './agent-queue'

describe('planEvolutionAgent', () => {
  it('ignores duplicates and our own API echoes', () => {
    expect(planEvolutionAgent({ fromMe: false, duplicate: true })).toBe('ignore')
    expect(
      planEvolutionAgent({ fromMe: true, source: 'api', duplicate: false }),
    ).toBe('ignore')
  })

  it('takes over when a human sends from the phone', () => {
    expect(planEvolutionAgent({ fromMe: true, duplicate: false })).toBe('takeover')
  })

  it('enqueues a customer message', () => {
    expect(planEvolutionAgent({ fromMe: false, duplicate: false })).toBe('enqueue')
    expect(AGENT_DEBOUNCE_MS).toBe(4000)
  })
})

describe('createAgentScheduler', () => {
  it('replaces the previous timer', async () => {
    const pending: { fn: () => void; cancelled: boolean }[] = []
    const scheduler = createAgentScheduler({
      later(_ms, fn) {
        const entry = { fn, cancelled: false }
        pending.push(entry)
        return () => {
          entry.cancelled = true
        }
      },
    })
    let ran = 0
    scheduler.schedule('c1', 4000, async () => {
      ran += 1
    })
    scheduler.schedule('c1', 4000, async () => {
      ran += 1
    })
    expect(pending[0].cancelled).toBe(true)
    pending[1].fn()
    await Promise.resolve()
    await Promise.resolve()
    expect(ran).toBe(1)
  })
})
