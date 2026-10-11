import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('GET /api/inbox/conversations', () => {
  it('does not merge contacts or conversations on the list path', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/api/inbox/conversations/route.ts'),
      'utf8',
    )
    expect(src).not.toContain('dedupeAccountInbox')
    expect(src).not.toContain('mergeOpenConversationsForContact')
    expect(src).not.toContain('lastFullDedupe')
  })
})
