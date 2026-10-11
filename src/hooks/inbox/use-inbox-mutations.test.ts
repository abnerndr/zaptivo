import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('useSendMessage', () => {
  it('does not invalidate the inbox when the send settles', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/hooks/inbox/use-inbox-mutations.ts'),
      'utf8',
    )
    const send = src.slice(src.indexOf('export function useSendMessage'))
    const settled = send.slice(send.indexOf('onSettled'))
    expect(settled.includes('invalidateQueries')).toBe(false)
  })
})
