import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  listContacts: vi.fn(),
  ensureAvatar: vi.fn(),
}))

vi.mock('@/domain/db/prisma', () => ({
  prisma: {
    whatsappConfig: { findUnique: mocks.findUnique },
    contact: {
      findFirst: mocks.findFirst,
      create: mocks.create,
      update: mocks.update,
    },
  },
}))
vi.mock('./resolve-transport', () => ({
  resolveWhatsAppTransport: vi.fn(async () => ({
    provider: 'WUZAPI',
    client: { listContacts: mocks.listContacts },
  })),
}))
vi.mock('./ensure-contact-avatar', () => ({
  ensureContactAvatar: mocks.ensureAvatar,
}))

describe('importWuzapiContacts', () => {
  beforeEach(() => {
    mocks.findUnique.mockResolvedValue({
      accountId: 'acc',
      provider: 'WUZAPI',
      wahaSession: 's',
    })
    mocks.listContacts.mockResolvedValue([
      { phone: '5511999999999', name: 'Ana' },
      { phone: '5511888888888', name: 'Bruno' },
    ])
    mocks.findFirst.mockReset()
    mocks.create.mockReset()
    mocks.update.mockReset()
    mocks.ensureAvatar.mockReset().mockResolvedValue(undefined)
  })

  it('creates contacts and skips overwriting a locked name', async () => {
    mocks.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'c2',
        name: 'Meu Bruno',
        nameLocked: true,
        phoneNormalized: '5511888888888',
      })
    mocks.create.mockResolvedValue({ id: 'c1' })

    const { importWuzapiContacts } = await import('./import-contacts')
    const result = await importWuzapiContacts('acc')
    expect(result).toEqual({ created: 1, updated: 0, skipped: 1 })
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: '5511999999999',
          name: 'Ana',
        }),
      }),
    )
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
