import { describe, expect, it } from 'vitest'
import {
  applyConversationPreview,
  applyMessageInsert,
  applyMessageMove,
} from './apply-realtime'
import type { InboxConversation, InboxMessage } from './types'

const event = {
  table: 'messages' as const,
  op: 'INSERT' as const,
  id: 'msg-1',
  accountId: 'acc',
  conversationId: 'conv-1',
  text: 'oi',
  direction: 'in' as const,
  contentType: 'text',
  mediaUrl: null,
  status: 'delivered',
  createdAt: '2026-10-10T18:00:00.000Z',
}

describe('applyMessageInsert', () => {
  it('appends a bubble once', () => {
    const first = applyMessageInsert(undefined, event)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({
      id: 'msg-1',
      sender_type: 'customer',
      content_text: 'oi',
      content_type: 'text',
      status: 'delivered',
      created_at: '2026-10-10T18:00:00.000Z',
    })
    expect(applyMessageInsert(first, event)).toHaveLength(1)
  })
})

describe('applyConversationPreview', () => {
  const list: InboxConversation[] = [
    {
      id: 'conv-2',
      last_message_text: 'antiga',
      last_message_at: '2026-10-10T17:00:00.000Z',
      unread_count: 0,
      contact: null,
    },
    {
      id: 'conv-1',
      last_message_text: 'antes',
      last_message_at: '2026-10-10T16:00:00.000Z',
      unread_count: 1,
      contact: null,
    },
  ]

  it('moves the known conversation to the top and bumps unread on inbound', () => {
    const result = applyConversationPreview(list, event)
    expect(result.known).toBe(true)
    expect(result.list[0]).toMatchObject({
      id: 'conv-1',
      last_message_text: 'oi',
      unread_count: 2,
    })
  })

  it('reports unknown conversations so the caller can refetch the list', () => {
    const result = applyConversationPreview(list, {
      ...event,
      conversationId: 'conv-new',
    })
    expect(result.known).toBe(false)
    expect(result.list.map((c) => c.id)).toEqual(['conv-2', 'conv-1'])
  })
})

describe('applyMessageMove', () => {
  const messages: InboxMessage[] = [
    {
      id: 'msg-1',
      sender_type: 'customer',
      content_text: 'oi',
      content_type: 'text',
      status: 'delivered',
      created_at: '2026-10-10T18:00:00.000Z',
    },
  ]

  it('removes the bubble from the old thread and appends it on the new one', () => {
    const move = {
      ...event,
      op: 'UPDATE' as const,
      movedFromConversationId: 'conv-1',
      movedToConversationId: 'conv-2',
    }
    expect(applyMessageMove(messages, move, 'conv-1')).toEqual([])
    expect(applyMessageMove([], move, 'conv-2')).toHaveLength(1)
  })
})
