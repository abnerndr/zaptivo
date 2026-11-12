import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  contactFindFirst: vi.fn(),
  conversationFindFirst: vi.fn(),
  resolveConversation: vi.fn(),
}))

vi.mock('@/domain/db/prisma', () => ({
  prisma: {
    contact: { findFirst: mocks.contactFindFirst },
    conversation: { findFirst: mocks.conversationFindFirst },
  },
}))

vi.mock('@/domain/whatsapp/resolve-conversation', () => ({
  resolveConversation: mocks.resolveConversation,
}))

const conversationRow = {
  id: 'conv-1',
  status: 'open',
  unreadCount: 0,
  lastMessageText: null,
  lastMessageAt: null,
  assignedAgentId: null,
  contact: {
    id: 'ct-1',
    name: null,
    phone: '5511999990000',
    avatarUrl: null,
  },
}

describe('openInboxConversation', () => {
  beforeEach(() => {
    mocks.contactFindFirst.mockReset()
    mocks.conversationFindFirst.mockReset()
    mocks.resolveConversation.mockReset()
  })

  it('rejects a blocked contact before resolving a conversation', async () => {
    mocks.contactFindFirst.mockResolvedValue({
      id: 'ct-1',
      phone: '5511999990000',
      blockedAt: new Date(),
    })
    const { openInboxConversation, InboxConversationError } = await import(
      './open-conversation'
    )
    await expect(
      openInboxConversation({ accountId: 'acc', contactId: 'ct-1' }),
    ).rejects.toMatchObject({
      name: 'InboxConversationError',
      message: 'Contato na blacklist',
      status: 403,
    })
    expect(mocks.resolveConversation).not.toHaveBeenCalled()
    expect(InboxConversationError).toBeDefined()
  })

  it('rejects a contact from another account', async () => {
    mocks.contactFindFirst.mockResolvedValue(null)
    const { openInboxConversation } = await import('./open-conversation')
    await expect(
      openInboxConversation({ accountId: 'acc', contactId: 'missing' }),
    ).rejects.toMatchObject({ status: 404 })
    expect(mocks.resolveConversation).not.toHaveBeenCalled()
  })

  it('rejects an invalid phone', async () => {
    const { openInboxConversation } = await import('./open-conversation')
    await expect(
      openInboxConversation({ accountId: 'acc', phone: 'maria' }),
    ).rejects.toMatchObject({ message: 'Telefone inválido', status: 400 })
    expect(mocks.resolveConversation).not.toHaveBeenCalled()
  })

  it('rejects a blocked phone before resolving a conversation', async () => {
    mocks.contactFindFirst.mockResolvedValue({
      id: 'ct-1',
      phone: '5511999990000',
      blockedAt: new Date(),
    })
    const { openInboxConversation } = await import('./open-conversation')
    await expect(
      openInboxConversation({ accountId: 'acc', phone: '11999990000' }),
    ).rejects.toMatchObject({
      message: 'Contato na blacklist',
      status: 403,
    })
    expect(mocks.resolveConversation).not.toHaveBeenCalled()
  })

  it('rejects when both contactId and phone are sent', async () => {
    const { openInboxConversation } = await import('./open-conversation')
    await expect(
      openInboxConversation({
        accountId: 'acc',
        contactId: 'ct-1',
        phone: '11999990000',
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(mocks.contactFindFirst).not.toHaveBeenCalled()
  })

  it('delegates a new phone to resolveConversation without a name', async () => {
    mocks.contactFindFirst.mockResolvedValue(null)
    mocks.resolveConversation.mockResolvedValue({
      conversationId: 'conv-1',
      contactId: 'ct-1',
      created: true,
    })
    mocks.conversationFindFirst.mockResolvedValue(conversationRow)
    const { openInboxConversation } = await import('./open-conversation')
    const opened = await openInboxConversation({
      accountId: 'acc',
      phone: '11999990000',
    })
    expect(mocks.resolveConversation).toHaveBeenCalledWith({
      accountId: 'acc',
      phone: '5511999990000',
    })
    expect(opened).toMatchObject({
      id: 'conv-1',
      created: true,
      unread_count: 0,
      last_message_text: null,
      contact: { id: 'ct-1', name: null, phone: '5511999990000' },
    })
  })

  it('reuses the stored phone when opening by contactId', async () => {
    mocks.contactFindFirst.mockResolvedValue({
      id: 'ct-1',
      phone: '5511999990000',
      blockedAt: null,
    })
    mocks.resolveConversation.mockResolvedValue({
      conversationId: 'conv-1',
      contactId: 'ct-1',
      created: false,
    })
    mocks.conversationFindFirst.mockResolvedValue(conversationRow)
    const { openInboxConversation } = await import('./open-conversation')
    const opened = await openInboxConversation({
      accountId: 'acc',
      contactId: 'ct-1',
    })
    expect(mocks.resolveConversation).toHaveBeenCalledWith({
      accountId: 'acc',
      phone: '5511999990000',
    })
    expect(opened.created).toBe(false)
  })
})
