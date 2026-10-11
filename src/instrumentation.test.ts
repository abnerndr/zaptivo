import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('instrumentation', () => {
  it('starts the WAHA consumer from the nodejs runtime only', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/instrumentation.ts'), 'utf8')
    expect(src).toContain('startWahaEventConsumer')
    expect(src).toContain("NEXT_RUNTIME === 'nodejs'")
  })
})
