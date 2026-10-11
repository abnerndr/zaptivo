import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('contact type panel', () => {
  it('is mounted on the contacts page and talks to the catalog API', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/app/(dashboard)/contacts/page.tsx'),
      'utf8',
    )
    const panel = readFileSync(
      resolve(process.cwd(), 'src/components/contacts/contact-type-panel.tsx'),
      'utf8',
    )

    expect(page).toContain('ContactTypePanel')
    expect(panel).toContain('/api/contact-types')
    expect(panel).toContain('typeId')
  })
})
