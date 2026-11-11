import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }))
vi.mock('react', () => ({
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, vi.fn()],
  useEffect: (effect: () => () => void) => { state.cleanup = effect() },
}))
import { useRealtime } from '@/hooks/use-realtime'

class FakeEventSource {
  static CLOSED = 2
  static instances: FakeEventSource[] = []
  readyState = 1
  onopen?: () => void
  onmessage?: (event: { data: string }) => void
  onerror?: () => void
  constructor(public url: string) { FakeEventSource.instances.push(this) }
  close() { this.readyState = FakeEventSource.CLOSED }
  send(payload: object) { this.onmessage?.({ data: JSON.stringify(payload) }) }
}

afterEach(() => {
  state.cleanup?.()
  state.cleanup = undefined
  FakeEventSource.instances = []
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('realtime client', () => {
  it('refreshes after reconnect and deduplicates inserts without suppressing updates', () => {
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', FakeEventSource)
    const handle = vi.fn()
    useRealtime('account', handle)
    const first = FakeEventSource.instances[0]
    first.onopen?.()
    first.send({ type: 'ready' })
    expect(handle).toHaveBeenCalledWith({ type: 'reconnect' })
    expect(handle).toHaveBeenCalledWith({ table: 'notifications' })
    handle.mockClear()
    const insert = { table: 'messages', op: 'INSERT', id: 'msg', conversationId: 'conv' }
    first.send(insert)
    first.send(insert)
    first.send({ ...insert, op: 'UPDATE' })
    expect(handle.mock.calls).toEqual([[insert], [{ ...insert, op: 'UPDATE' }]])
    first.onerror?.()
    vi.advanceTimersByTime(1000)
    const second = FakeEventSource.instances[1]
    second.send({ type: 'ready' })
    second.send(insert)
    expect(handle.mock.calls.filter(([value]) => value.table === 'messages' && value.op === 'INSERT')).toHaveLength(1)
    expect(handle.mock.calls.filter(([value]) => value.type === 'reconnect')).toHaveLength(1)
  })
})
