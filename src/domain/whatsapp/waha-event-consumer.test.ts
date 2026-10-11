import { describe, expect, it } from 'vitest'
import { consumerEnabled, parseWahaEventData } from './waha-event-consumer'

describe('parseWahaEventData', () => {
  it('reads event, session and payload', () => {
    expect(
      parseWahaEventData(
        JSON.stringify({
          event: 'message',
          session: 'default',
          payload: { from: '5511999999999@c.us', body: 'oi' },
        }),
      ),
    ).toEqual({
      event: 'message',
      session: 'default',
      payload: { from: '5511999999999@c.us', body: 'oi' },
    })
  })

  it('returns null for malformed data', () => {
    expect(parseWahaEventData('nope')).toBeNull()
    expect(parseWahaEventData('{}')).toBeNull()
  })
})

describe('consumerEnabled', () => {
  it('is on only for an explicit flag, a base url, and not during build', () => {
    expect(
      consumerEnabled({
        WAHA_EVENT_CONSUMER: '1',
        WAHA_BASE_URL: 'https://waha.example',
      }),
    ).toBe(true)
    expect(
      consumerEnabled({
        WAHA_EVENT_CONSUMER: '1',
        WAHA_BASE_URL: 'https://waha.example',
        NEXT_PHASE: 'phase-production-build',
      }),
    ).toBe(false)
    expect(
      consumerEnabled({ WAHA_BASE_URL: 'https://waha.example' }),
    ).toBe(false)
  })
})
