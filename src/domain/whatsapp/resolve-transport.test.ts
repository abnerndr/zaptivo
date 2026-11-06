import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  readCred: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/domain/db/prisma', () => ({
  prisma: { whatsappConfig: { findUnique: mocks.findUnique } },
}))

vi.mock('../../../prisma/whatsapp-credential', () => ({
  readWhatsappCredential: mocks.readCred,
}))

describe('resolveWhatsAppTransport', () => {
  beforeEach(() => {
    mocks.findUnique.mockReset()
    mocks.readCred.mockReset()
  })

  it('builds a WuzapiTransport when provider is WUZAPI', async () => {
    vi.stubEnv('WUZAPI_BASE_URL', 'https://wuz.example/api')
    mocks.findUnique.mockResolvedValue({
      accountId: 'acc',
      provider: 'WUZAPI',
      wahaSession: 'unused',
      providerSessionId: 'wuz-user-1',
      status: 'WORKING',
    })
    mocks.readCred.mockResolvedValue('user-token')
    const { resolveWhatsAppTransport } = await import('./resolve-transport')
    const transport = await resolveWhatsAppTransport('acc')
    expect(transport.provider).toBe('WUZAPI')
    expect(transport.session).toBe('wuz-user-1')
  })
})
