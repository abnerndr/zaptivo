import { describe, expect, it } from 'vitest'
import { confirmOptimisticMessage } from './use-send-message-cache'
import type { InboxMessage } from './types'

const list: InboxMessage[] = [
  {
    id: 'temp-1',
    sender_type: 'agent',
    content_text: 'oi',
    content_type: 'text',
    status: 'sending',
    created_at: '2026-10-10T18:00:00.000Z',
  },
]

describe('confirmOptimisticMessage', () => {
  it('replaces the temporary bubble with the server id', () => {
    const next = confirmOptimisticMessage(list, 'temp-1', {
      id: 'msg-9',
      contentText: 'oi',
      contentType: 'text',
      status: 'sent',
      createdAt: '2026-10-10T18:00:01.000Z',
    })
    expect(next?.[0]).toMatchObject({
      id: 'msg-9',
      status: 'sent',
      sender_type: 'agent',
    })
  })
})
