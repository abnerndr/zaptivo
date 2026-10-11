import { describe, expect, it } from 'vitest'
import { messageInsertPayload } from './payload'

describe('messageInsertPayload', () => {
  it('carries the fields the open thread needs to append a bubble', () => {
    const createdAt = new Date('2026-10-10T18:00:00.000Z')
    expect(
      messageInsertPayload({
        id: 'msg-1',
        accountId: 'acc-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        text: 'oi',
        fromMe: false,
        contentType: 'text',
        mediaUrl: null,
        status: 'delivered',
        createdAt,
      }),
    ).toEqual({
      table: 'messages',
      op: 'INSERT',
      id: 'msg-1',
      accountId: 'acc-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      text: 'oi',
      direction: 'in',
      contentType: 'text',
      mediaUrl: null,
      status: 'delivered',
      createdAt: '2026-10-10T18:00:00.000Z',
    })
  })

  it('marks outgoing messages as out', () => {
    const payload = messageInsertPayload({
      id: 'msg-2',
      accountId: 'acc-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      text: 'olá',
      fromMe: true,
      contentType: 'text',
      mediaUrl: null,
      status: 'sent',
      createdAt: new Date('2026-10-10T18:00:01.000Z'),
    })
    expect(payload.direction).toBe('out')
  })
})
