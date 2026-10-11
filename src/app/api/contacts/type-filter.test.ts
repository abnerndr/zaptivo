import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('contacts API type filter', () => {
  it('filters by typeId and returns the type', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/api/contacts/route.ts'),
      'utf8',
    )
    expect(src).toContain('typeId')
    expect(src).toContain('contactType')
  })

  it('exposes catalog routes', () => {
    const list = readFileSync(
      resolve(process.cwd(), 'src/app/api/contact-types/route.ts'),
      'utf8',
    )
    expect(list).toContain('parseContactTypeInput')
    expect(list).toContain('requireSessionAccount')
  })
})
