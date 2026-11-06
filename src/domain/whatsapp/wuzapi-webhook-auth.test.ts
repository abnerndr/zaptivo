import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  decrypt: vi.fn(),
}))

vi.mock('@/domain/db/prisma', () => ({
  prisma: { whatsappConfig: { findMany: mocks.findMany } },
}))
vi.mock('@/domain/whatsapp/encryption', () => ({
  decrypt: mocks.decrypt,
}))

describe('findWuzapiAccountByToken', () => {
  beforeEach(() => {
    mocks.findMany.mockReset()
    mocks.decrypt.mockReset()
  })

  it('returns the matching WuzAPI account without leaking other tokens', async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: 'a',
        accountId: 'acc-a',
        wahaSession: 's-a',
        providerSessionId: 'u-a',
        encryptedCredential: 'enc-a',
      },
      {
        id: 'b',
        accountId: 'acc-b',
        wahaSession: 's-b',
        providerSessionId: 'u-b',
        encryptedCredential: 'enc-b',
      },
    ])
    mocks.decrypt.mockImplementation((value: string) =>
      value === 'enc-b' ? 'secret-b' : 'other',
    )
    const { findWuzapiAccountByToken } = await import('./wuzapi-webhook-auth')
    expect(await findWuzapiAccountByToken('secret-b')).toEqual({
      id: 'b',
      accountId: 'acc-b',
      wahaSession: 's-b',
      providerSessionId: 'u-b',
    })
    expect(await findWuzapiAccountByToken('missing')).toBeNull()
    expect(await findWuzapiAccountByToken(null)).toBeNull()
  })
})
