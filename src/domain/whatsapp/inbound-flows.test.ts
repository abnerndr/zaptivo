import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('inbound flows', () => {
  it('does not dispatch a new message into the flow engine', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/domain/whatsapp/inbound.ts'),
      'utf8',
    )
    expect(src).not.toContain('dispatchInboundToFlows')
    expect(src).not.toContain("@/domain/flows/engine")
  })
})
