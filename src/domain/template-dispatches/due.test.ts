import { describe, expect, it } from 'vitest'
import { isDue } from './due'

describe('isDue', () => {
  const now = new Date('2026-10-10T18:00:00.000Z')

  it('is due when queued or scheduled and runAt has arrived', () => {
    expect(isDue('queued', now, now)).toBe(true)
    expect(isDue('scheduled', new Date('2026-10-10T17:00:00.000Z'), now)).toBe(true)
  })

  it('is not due in the future or after it already finished', () => {
    expect(isDue('scheduled', new Date('2026-10-11T18:00:00.000Z'), now)).toBe(false)
    expect(isDue('sent', now, now)).toBe(false)
    expect(isDue('sending', now, now)).toBe(false)
  })
})
