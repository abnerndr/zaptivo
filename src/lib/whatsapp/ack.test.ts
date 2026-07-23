import { describe, expect, it } from 'vitest'
import { mapWahaAckToStatus } from '@/lib/whatsapp/ack-status'

describe('mapWahaAckToStatus', () => {
  it('maps WAHA ack numbers to message status', () => {
    expect(mapWahaAckToStatus(-1)).toBe('failed')
    expect(mapWahaAckToStatus(0)).toBe('sent')
    expect(mapWahaAckToStatus(1)).toBe('sent')
    expect(mapWahaAckToStatus(2)).toBe('delivered')
    expect(mapWahaAckToStatus(3)).toBe('read')
    expect(mapWahaAckToStatus(4)).toBe('read')
  })

  it('accepts string ack values', () => {
    expect(mapWahaAckToStatus('2')).toBe('delivered')
    expect(mapWahaAckToStatus('3')).toBe('read')
  })

  it('returns null for unknown values', () => {
    expect(mapWahaAckToStatus(null)).toBeNull()
    expect(mapWahaAckToStatus(undefined)).toBeNull()
    expect(mapWahaAckToStatus('nope')).toBeNull()
  })
})
