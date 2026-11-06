import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  createUser: vi.fn(),
  storeCred: vi.fn(),
  connect: vi.fn(),
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
      delete: vi.fn(),
    },
  },
}))
vi.mock('@/domain/whatsapp/evolution-api', () => ({
  ensureSession: vi.fn(),
  stopSession: vi.fn(),
  getSession: vi.fn(),
}))
vi.mock('@/domain/whatsapp/wuzapi-admin', () => ({
  WuzapiAdmin: class {
    createUser = mocks.createUser
    deleteUser = vi.fn()
  },
}))
vi.mock('../../../../../prisma/whatsapp-credential', () => ({
  storeWhatsappCredential: mocks.storeCred,
  readWhatsappCredential: vi.fn(),
}))
vi.mock('@/domain/whatsapp/wuzapi-api', () => ({
  WuzapiTransport: class {
    connect = mocks.connect
    status = vi.fn().mockResolvedValue({ connected: true, loggedIn: false })
  },
  wuzapiWebhookUrl: () => 'https://app.example/webhook/whatsapp',
}))

import { POST } from './route'

describe('POST /api/whatsapp/config', () => {
  beforeEach(() => {
    mocks.requireSession.mockResolvedValue({ accountId: 'acc-1' })
    mocks.createUser.mockReset()
    mocks.storeCred.mockReset()
    mocks.connect.mockReset().mockResolvedValue(undefined)
    mocks.upsert.mockReset()
    mocks.update.mockReset()
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
    expect(mocks.storeCred).toHaveBeenCalledWith('acc-1', expect.any(String))
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ provider: 'WUZAPI' }),
      }),
    )
  })
})
