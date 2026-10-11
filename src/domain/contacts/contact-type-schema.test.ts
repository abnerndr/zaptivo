import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ContactType schema', () => {
  const schema = readFileSync(
    resolve(process.cwd(), 'prisma/schema.prisma'),
    'utf8',
  )

  it('defines an optional type on the contact and a per-account catalog', () => {
    expect(schema).toContain('model ContactType')
    expect(schema).toContain('typeId')
    expect(schema).toContain('@map("type_id")')
    expect(schema).toContain('@@unique([accountId, name])')
    expect(schema).toContain('@map("contact_types")')
  })
})
