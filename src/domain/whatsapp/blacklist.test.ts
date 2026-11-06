import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  block: vi.fn(),
  unblock: vi.fn(),
  resolve: vi.fn(),
}))

vi.mock('@/domain/db/prisma', () => ({
  prisma: {
    contact: { findFirst: mocks.findFirst, update: mocks.update },
  },
}))
vi.mock('./resolve-transport', () => ({
  resolveWhatsAppTransport: mocks.resolve,
}))

describe('blacklist', () => {
  beforeEach(() => {
    mocks.findFirst.mockReset()
    mocks.update.mockReset()
    mocks.block.mockReset()
    mocks.unblock.mockReset()
    mocks.resolve.mockReset().mockResolvedValue({
      provider: 'WUZAPI',
      client: { block: mocks.block, unblock: mocks.unblock },
    })
  })

  it('persists blockedAt and calls WuzAPI block', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'c1',
      phone: '5511999999999',
      blockedAt: null,
    })
    mocks.update.mockResolvedValue({})
    const { blockContact } = await import('./blacklist')
    await blockContact('acc', 'c1')
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: { blockedAt: expect.any(Date) },
      }),
    )
    expect(mocks.block).toHaveBeenCalledWith('5511999999999')
  })
})
