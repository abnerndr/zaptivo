import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const schema = readFileSync(
  join(process.cwd(), 'prisma/schema.prisma'),
  'utf8',
)

describe('prisma schema: template dispatches', () => {
  it.each([
    'model TemplateDispatch ',
    'model TemplateDispatchRecipient ',
    '@@map("template_dispatches")',
    '@@map("template_dispatch_recipients")',
    'runAt',
    'templateId',
  ])('contém %s', (trecho) => {
    expect(schema).toContain(trecho)
  })
})
