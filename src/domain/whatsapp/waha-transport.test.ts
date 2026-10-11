import { describe, expect, it } from 'vitest'
import { classifyWahaTransport } from './waha-transport'

describe('classifyWahaTransport', () => {
  it('picks sse only when the events response is an event stream', () => {
    expect(
      classifyWahaTransport({
        eventsStatus: 200,
        eventsContentType: 'text/event-stream; charset=utf-8',
      }),
    ).toBe('sse')
  })

  it('falls back to websocket otherwise', () => {
    expect(
      classifyWahaTransport({ eventsStatus: 404, eventsContentType: null }),
    ).toBe('websocket')
    expect(
      classifyWahaTransport({
        eventsStatus: 200,
        eventsContentType: 'application/json',
      }),
    ).toBe('websocket')
  })
})
