import { describe, it, expect } from 'vitest'
import { parseAudienceFilter } from './audience'

describe('parseAudienceFilter', () => {
  it('defaults to all', () => {
    expect(parseAudienceFilter(undefined)).toEqual({ mode: 'all', tagIds: [] })
  })
  it('reads tagIds', () => {
    expect(parseAudienceFilter({ mode: 'tags', tagIds: ['a', 'b'] })).toEqual({
      mode: 'tags',
      tagIds: ['a', 'b'],
    })
  })
})
