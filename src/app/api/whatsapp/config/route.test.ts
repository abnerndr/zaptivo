import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  createUser: vi.fn(),
  listUsers: vi.fn(),
  storeCred: vi.fn(),
  connect: vi.fn(),
  status: vi.fn(),
  deleteConfig: vi.fn(),
  deleteUser: vi.fn(),
}))

vi.mock('@/domain/auth/context', () => ({
  requireSessionAccount: mocks.requireSession,
}))
vi.mock('@/domain/db/prisma', () => ({
  prisma: {
    whatsappConfig: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
      update: mocks.update,
      delete: mocks.deleteConfig,
    },
  },
}))
vi.mock('@/domain/whatsapp/wuzapi-admin', () => ({
  WuzapiAdmin: class {
    createUser = mocks.createUser
    listUsers = mocks.listUsers
    deleteUser = mocks.deleteUser
  },
}))
vi.mock('../../../../../prisma/whatsapp-credential', () => ({
  storeWhatsappCredential: mocks.storeCred,
  readWhatsappCredential: vi.fn(),
}))
vi.mock('@/domain/whatsapp/wuzapi-api', () => ({
  WuzapiTransport: class {
    connect = mocks.connect
    status = mocks.status
  },
  wuzapiWebhookUrl: () => 'https://app.example/webhook/whatsapp',
}))

import { DELETE, GET, POST } from './route'

describe('POST /api/whatsapp/config', () => {
  beforeEach(() => {
    mocks.findUnique.mockReset().mockResolvedValue(null)
    mocks.requireSession.mockResolvedValue({ accountId: 'acc-1' })
    mocks.createUser.mockReset()
    mocks.listUsers.mockReset().mockResolvedValue([])
    mocks.storeCred.mockReset()
    mocks.connect.mockReset().mockResolvedValue(undefined)
    mocks.status.mockReset().mockResolvedValue({ connected: true, loggedIn: false })
    mocks.upsert.mockReset()
    mocks.update.mockReset()
    mocks.deleteConfig.mockReset().mockResolvedValue({ id: 'cfg-1' })
    mocks.deleteUser.mockReset().mockResolvedValue(undefined)
  })

  it('unlinks the local account and keeps the remote WuzAPI instance', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'cfg-1',
      provider: 'WUZAPI',
      providerSessionId: 'uid-1',
    })
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(mocks.deleteConfig).toHaveBeenCalledWith({ where: { id: 'cfg-1' } })
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('lists remote instances without their tokens when the account is not linked', async () => {
    mocks.listUsers.mockResolvedValue([
      { id: 'uid-1', name: 'juspilot', token: 'secret-user-token', connected: true, loggedIn: true, jid: '5516997720763@s.whatsapp.net' },
    ])
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      configured: false,
      instances: [{ id: 'uid-1', name: 'juspilot', connected: true, logged_in: true, jid: '5516997720763@s.whatsapp.net' }],
    })
    expect(JSON.stringify(body)).not.toContain('secret-user-token')
  })

  it('keeps the settings page available when the admin API is unreachable', async () => {
    mocks.listUsers.mockRejectedValue(new Error('Invalid WuzAPI admin response (HTTP 404: 404 page not found)'))
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      configured: false,
      instances: [],
      admin_error: 'Invalid WuzAPI admin response (HTTP 404: 404 page not found)',
    })
  })

  it('creates a WuzAPI user instance and stores the encrypted token', async () => {
    mocks.createUser.mockResolvedValue({
      id: 'uid-1',
      name: 'Loja',
      token: 'tok-generated',
    })
    mocks.upsert.mockResolvedValue({
      id: 'cfg-1',
      accountId: 'acc-1',
      wahaSession: 'wuz_acc-1_uid-1',
    })
    mocks.storeCred.mockResolvedValue(undefined)

    const res = await POST(
      new Request('https://example.test/api/whatsapp/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'WUZAPI', display_name: 'Loja' }),
      }),
    )
    expect(res.status).toBe(200)
    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Loja',
        webhook: 'https://app.example/webhook/whatsapp',
      }),
    )
    expect(mocks.storeCred).toHaveBeenCalledWith('acc-1', 'tok-generated')
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ provider: 'WUZAPI' }),
      }),
    )
  })
  it('rejects unsupported providers without provisioning', async () => {
    const res = await POST(new Request('https://example.test/api/whatsapp/config', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'EVOLUTION' }),
    }))
    expect(res.status).toBe(400)
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('replaces a legacy configuration with a fresh WuzAPI session', async () => {
    mocks.findUnique.mockResolvedValue({ provider: 'EVOLUTION', wahaSession: 'old', providerSessionId: 'legacy', encryptedCredential: 'legacy', status: 'WORKING' })
    mocks.createUser.mockResolvedValue({ id: 'new-user', name: 'Loja', token: 'new-token' })
    mocks.upsert.mockResolvedValue({ id: 'cfg-1' })
    const res = await POST(new Request('https://example.test/api/whatsapp/config', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ display_name: 'Loja' }),
    }))
    expect(res.status).toBe(200)
    expect(mocks.createUser).toHaveBeenCalledOnce()
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ provider: 'WUZAPI', status: 'STOPPED', connectedAt: null, providerSessionId: 'new-user' }) }))
    expect(mocks.storeCred).toHaveBeenCalledWith('acc-1', 'new-token')
  })

  it('links an existing logged-in instance without creating a user or reconnecting', async () => {
    mocks.listUsers.mockResolvedValue([
      { id: 'uid-1', name: 'juspilot', token: 'secret-user-token', connected: true, loggedIn: true, jid: '5516997720763@s.whatsapp.net' },
    ])
    mocks.status.mockResolvedValue({ connected: true, loggedIn: true })
    mocks.upsert.mockResolvedValue({ id: 'cfg-1' })
    const res = await POST(new Request('https://example.test/api/whatsapp/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instance_id: 'uid-1' }),
    }))
    expect(res.status).toBe(200)
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(mocks.connect).not.toHaveBeenCalled()
    expect(mocks.storeCred).toHaveBeenCalledWith('acc-1', 'secret-user-token')
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'WORKING' }),
    }))
  })

  it('reports connection failure after provisioning', async () => {
    mocks.createUser.mockResolvedValue({ id: 'uid', name: 'Loja', token: 'token' })
    mocks.upsert.mockResolvedValue({ id: 'cfg-1' })
    mocks.connect.mockRejectedValue(new Error('unavailable'))
    const res = await POST(new Request('https://example.test/api/whatsapp/config', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }))
    expect(res.status).toBe(502)
  })

})
