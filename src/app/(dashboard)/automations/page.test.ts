import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('automations page', () => {
  it('posts an explicit template dispatch', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/(dashboard)/automations/page.tsx'),
      'utf8',
    )
    expect(src).toContain('/api/template-dispatches')
    expect(src).toContain('contactIds')
    expect(src).not.toContain('TRIGGER_META')
  })
})
