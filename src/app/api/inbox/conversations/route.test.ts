import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSessionAccount: vi.fn(),
  getOrgRolePermissions: vi.fn(),
  openInboxConversation: vi.fn(),
}))

vi.mock('@/domain/db/prisma', () => ({ prisma: {} }))
vi.mock('@/domain/auth/context', () => ({
  requireSessionAccount: mocks.requireSessionAccount,
}))
vi.mock('@/domain/auth/org-roles', () => ({
  getOrgRolePermissions: mocks.getOrgRolePermissions,
}))

class InboxConversationError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'InboxConversationError'
    this.status = status
  }
}

vi.mock('@/domain/inbox/open-conversation', () => ({
  openInboxConversation: mocks.openInboxConversation,
  InboxConversationError,
}))

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

describe('POST /api/inbox/conversations', () => {
  beforeEach(() => {
    mocks.requireSessionAccount.mockReset()
    mocks.getOrgRolePermissions.mockReset().mockResolvedValue(new Set(['inbox.send']))
    mocks.openInboxConversation.mockReset()
  })

  it('forbids a viewer', async () => {
    mocks.requireSessionAccount.mockResolvedValue({
      accountId: 'acc',
      role: 'viewer',
      profile: { orgRoleId: 'role' },
    })
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://local/api/inbox/conversations', {
        method: 'POST',
        body: JSON.stringify({ phone: '11999990000' }),
      }),
    )
    expect(res.status).toBe(403)
    expect(mocks.openInboxConversation).not.toHaveBeenCalled()
  })

  it('returns the opened conversation', async () => {
    mocks.requireSessionAccount.mockResolvedValue({
      accountId: 'acc',
      role: 'agent',
      profile: { orgRoleId: 'role' },
    })
    mocks.openInboxConversation.mockResolvedValue({ id: 'conv-1', created: true })
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://local/api/inbox/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '11999990000' }),
      }),
    )
    expect(res.status).toBe(200)
    expect(mocks.openInboxConversation).toHaveBeenCalledWith({
      accountId: 'acc',
      contactId: undefined,
      phone: '11999990000',
    })
  })

  it('maps a domain error to its status', async () => {
    mocks.requireSessionAccount.mockResolvedValue({
      accountId: 'acc',
      role: 'agent',
      profile: { orgRoleId: 'role' },
    })
    mocks.openInboxConversation.mockRejectedValue(
      new InboxConversationError('Contato na blacklist', 403),
    )
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://local/api/inbox/conversations', {
        method: 'POST',
        body: JSON.stringify({ contactId: 'ct-1' }),
      }),
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Contato na blacklist' })
  })
})
