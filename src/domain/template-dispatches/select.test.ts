import { describe, expect, it } from 'vitest'
import { dispatchTiming, selectContactIds } from './select'

const contacts = [
  { id: 'a', typeId: 'lead' },
  { id: 'b', typeId: 'cliente' },
  { id: 'c', typeId: null },
]

describe('selectContactIds', () => {
  it('returns only checked contacts, in the checked order', () => {
    expect(
      selectContactIds({
        contacts,
        selectedIds: ['c', 'a', 'missing'],
        typeId: null,
      }),
    ).toEqual(['c', 'a'])
  })

  it('drops checked contacts that do not match the type filter', () => {
    expect(
      selectContactIds({
        contacts,
        selectedIds: ['a', 'b', 'c'],
        typeId: 'lead',
      }),
    ).toEqual(['a'])
  })

  it('does not expand a type into the whole base', () => {
    expect(
      selectContactIds({
        contacts,
        selectedIds: [],
        typeId: 'lead',
      }),
    ).toEqual([])
  })
})

describe('dispatchTiming', () => {
  const now = new Date('2026-10-10T18:00:00.000Z')

  it('queues when runAt is missing or not in the future', () => {
    expect(dispatchTiming(null, now).status).toBe('queued')
    expect(dispatchTiming('2026-10-10T17:00:00.000Z', now).status).toBe('queued')
    expect(dispatchTiming('not-a-date', now).status).toBe('queued')
  })

  it('schedules a future instant', () => {
    const result = dispatchTiming('2026-10-11T12:00:00.000Z', now)
    expect(result.status).toBe('scheduled')
    expect(result.runAt.toISOString()).toBe('2026-10-11T12:00:00.000Z')
  })
})
