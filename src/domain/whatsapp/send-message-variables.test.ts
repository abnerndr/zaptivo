import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findConversation: vi.fn(), findConfig: vi.fn(), sendText: vi.fn(), createMessage: vi.fn(), updateConversation: vi.fn(),
}))
vi.mock('@/domain/db/prisma', () => ({ prisma: {
  conversation: { findFirst: mocks.findConversation, update: mocks.updateConversation },
  whatsappConfig: { findUnique: mocks.findConfig },
  message: { create: mocks.createMessage },
  flowRun: { updateMany: vi.fn() },
} }))
vi.mock('@/domain/db/notify', () => ({ notifyAccount: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/domain/whatsapp/resolve-transport', () => ({ resolveWhatsAppTransport: vi.fn().mockResolvedValue({ sendText: mocks.sendText }) }))

import { sendMessageToConversation } from './send-message'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findConversation.mockResolvedValue({ contact: { id: 'contact', name: 'Ana Silva', phone: '5511999990000', email: null, company: null, blockedAt: null } })
  mocks.findConfig.mockResolvedValue({ status: 'WORKING' })
  mocks.sendText.mockResolvedValue({ remoteId: 'remote' })
  mocks.createMessage.mockImplementation(async ({ data }) => ({ ...data, id: 'message', createdAt: new Date('2026-01-01'), status: 'sent' }))
  mocks.updateConversation.mockResolvedValue({})
})

it('sends and persists the rendered text for the account conversation', async () => {
  const result = await sendMessageToConversation('account', { conversationId: 'conv', messageType: 'text', contentText: 'Olá {{first_name}}!', renderInboxVariables: true })
  expect(mocks.findConversation).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'conv', accountId: 'account' } }))
  expect(mocks.sendText).toHaveBeenCalledWith(expect.any(String), 'Olá Ana!', expect.any(String))
  expect(mocks.createMessage).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ contentText: 'Olá Ana!' }) }))
  expect(mocks.updateConversation).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastMessageText: 'Olá Ana!' }) }))
  expect(result.contentText).toBe('Olá Ana!')
})

it('rejects unavailable or unknown variables before sending', async () => {
  await expect(sendMessageToConversation('account', { conversationId: 'conv', messageType: 'text', contentText: '{{email}} {{unknown}}', renderInboxVariables: true })).rejects.toMatchObject({ code: 'invalid_variables', status: 400 })
  expect(mocks.sendText).not.toHaveBeenCalled()
  expect(mocks.createMessage).not.toHaveBeenCalled()
})

it('preserves literal variables for callers that have not opted in', async () => {
  await sendMessageToConversation('account', { conversationId: 'conv', messageType: 'text', contentText: 'Olá {{name}}' })
  expect(mocks.sendText).toHaveBeenCalledWith(expect.any(String), 'Olá {{name}}', expect.any(String))
})
