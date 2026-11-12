import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn(), permissions: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }))
vi.mock('@/domain/auth/context', () => ({ requireSessionAccount: mocks.session }))
vi.mock('@/domain/auth/org-roles', () => ({ getOrgRolePermissions: mocks.permissions }))
vi.mock('@/domain/db/prisma', () => ({ prisma: { quickReply: { findMany: mocks.list, create: mocks.create, updateMany: mocks.update, deleteMany: mocks.remove } } }))

import { GET, POST } from './route'
import { PATCH, DELETE } from './[id]/route'

const id = '00000000-0000-4000-8000-000000000001'
const context = { params: Promise.resolve({ id }) }
const body = { title: 'Boas-vindas', kind: 'text', content_text: 'Olá {{first_name}}' }
const request = (method: string, data: unknown = body) => new Request('http://localhost/api/quick-replies', { method, headers: { 'Content-Type': 'application/json' }, ...(method !== 'DELETE' ? { body: JSON.stringify(data) } : {}) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.mockResolvedValue({ accountId: 'account-a', userId: 'user', role: 'agent', profile: { orgRoleId: null } })
  mocks.permissions.mockResolvedValue(new Set(['inbox.send']))
})

it('lists only the account models', async () => {
  mocks.list.mockResolvedValue([])
  const res = await GET()
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ quick_replies: [] })
  expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ where: { accountId: 'account-a' } }))
})

it('creates a reusable text with its placeholders and account ownership', async () => {
  mocks.create.mockImplementation(async ({ data }) => ({ ...data, id, interactivePayload: null, createdAt: new Date(), updatedAt: new Date() }))
  const res = await POST(request('POST'))
  expect(res.status).toBe(201)
  expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ accountId: 'account-a', userId: 'user', contentText: 'Olá {{first_name}}' }) })
  expect((await res.json()).quick_reply.content_text).toBe('Olá {{first_name}}')
})

it('validates required text and rejects viewers before writing', async () => {
  expect((await POST(request('POST', { ...body, content_text: ' ' }))).status).toBe(400)
  mocks.session.mockResolvedValue({ accountId: 'account-a', userId: 'user', role: 'viewer', profile: { orgRoleId: null } })
  expect((await POST(request('POST'))).status).toBe(403)
  expect((await PATCH(request('PATCH'), context)).status).toBe(403)
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})

it('scopes updates and deletions to the account and returns 404 for other accounts', async () => {
  mocks.update.mockResolvedValue({ count: 0 })
  mocks.remove.mockResolvedValue({ count: 0 })
  expect((await PATCH(request('PATCH'), context)).status).toBe(404)
  expect((await DELETE(request('DELETE'), context)).status).toBe(404)
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id, accountId: 'account-a' } }))
  expect(mocks.remove).toHaveBeenCalledWith({ where: { id, accountId: 'account-a' } })
  mocks.update.mockResolvedValue({ count: 1 })
  mocks.remove.mockResolvedValue({ count: 1 })
  expect((await PATCH(request('PATCH'), context)).status).toBe(200)
  expect((await DELETE(request('DELETE'), context)).status).toBe(200)
})
