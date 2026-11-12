import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn(), permissions: vi.fn(), send: vi.fn() }))
vi.mock('@/domain/auth/context', () => ({ requireSessionAccount: mocks.session }))
vi.mock('@/domain/auth/org-roles', () => ({ getOrgRolePermissions: mocks.permissions }))
vi.mock('@/domain/whatsapp/send-message', () => ({
  sendMessageToConversation: mocks.send,
  SendMessageError: class extends Error {},
}))
import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.mockResolvedValue({ accountId: 'account', role: 'viewer', profile: { orgRoleId: null } })
  mocks.permissions.mockResolvedValue(new Set())
})

it('passes the inbox variable option to the send service', async () => {
  mocks.session.mockResolvedValue({ accountId: 'account', role: 'agent', profile: { orgRoleId: null } })
  mocks.permissions.mockResolvedValue(new Set(['inbox.send']))
  mocks.send.mockResolvedValue({ messageId: 'message' })
  const response = await POST(new Request('https://example.test/api/whatsapp/send', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: 'conv', message_type: 'text', content_text: 'Olá {{name}}', render_inbox_variables: true }),
    headers: { 'content-type': 'application/json' },
  }))
  expect(response.status).toBe(200)
  expect(mocks.send).toHaveBeenCalledWith('account', expect.objectContaining({ conversationId: 'conv', renderInboxVariables: true }))
})

it('rejects viewer sends before calling the provider', async () => {
  const response = await POST(new Request('https://example.test/api/whatsapp/send', {
    method: 'POST', body: '{}', headers: { 'content-type': 'application/json' },
  }))
  expect(response.status).toBe(403)
  expect(mocks.send).not.toHaveBeenCalled()
})
