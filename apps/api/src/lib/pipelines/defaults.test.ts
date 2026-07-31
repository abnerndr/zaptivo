import { describe, it, expect } from 'vitest'
import { DEFAULT_PIPELINE_STAGES } from './defaults'

describe('DEFAULT_PIPELINE_STAGES', () => {
  it('has four stages with unique positions starting at 0', () => {
    expect(DEFAULT_PIPELINE_STAGES).toHaveLength(4)
    expect(DEFAULT_PIPELINE_STAGES.map((s) => s.position)).toEqual([0, 1, 2, 3])
    expect(DEFAULT_PIPELINE_STAGES.map((s) => s.name)).toEqual([
      'Lead',
      'Qualified',
      'Proposal',
      'Won',
    ])
  })
})
