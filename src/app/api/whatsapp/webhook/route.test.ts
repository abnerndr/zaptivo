import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  ingest: vi.fn(),
  agent: vi.fn(),
  findWuz: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/domain/db/prisma', () => ({
  prisma: {
    whatsappConfig: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}))
vi.mock('@/domain/db/notify', () => ({ notifyAccount: mocks.notify }))
vi.mock('@/domain/whatsapp/ack', () => ({ ingestWahaAck: vi.fn() }))
vi.mock('@/domain/whatsapp/agent-job', () => ({ applyEvolutionAgentPlan: mocks.agent }))
vi.mock('@/domain/whatsapp/inbound', () => ({ ingestWahaMessage: mocks.ingest }))
vi.mock('@/domain/whatsapp/wuzapi-webhook-auth', () => ({
  findWuzapiAccountByToken: mocks.findWuz,
}))

import { POST as apiPost } from './route'
import { POST as publicPost } from '@/app/webhook/whatsapp/route'

const wuzMessage = JSON.stringify({
  type: 'Message',
  event: {
    Info: {
      ID: 'wuz-1',
      Chat: '5511888777666@s.whatsapp.net',
      Sender: '5511888777666@s.whatsapp.net',
      IsFromMe: false,
      PushName: 'Joao',
    },
    Message: { conversation: 'ping' },
  },
})

function wuzRequest(body = wuzMessage, token = 'user-token') {
  return new Request('https://example.test/webhook/whatsapp', {
    method: 'POST',
    headers: { token, 'content-type': 'application/json' },
    body,
  })
}

describe('WhatsApp webhook routes', () => {
  beforeEach(() => {
    mocks.findUnique.mockResolvedValue({
      id: 'config',
      accountId: 'account',
      provider: 'EVOLUTION',
    })
    mocks.update.mockResolvedValue({})
    mocks.ingest.mockReset()
    mocks.agent.mockReset().mockResolvedValue(undefined)
    mocks.findWuz.mockReset()
    mocks.notify.mockReset().mockResolvedValue(undefined)
  })

  it('uses the same authenticated handler on both webhook paths', async () => {
    expect(publicPost).toBe(apiPost)
    expect((await publicPost(wuzRequest())).status).toBe(401)
    expect(mocks.ingest).not.toHaveBeenCalled()
  })

  it('rejects malformed authenticated requests', async () => {
    mocks.findWuz.mockResolvedValue({ id: 'cfg', accountId: 'acc', wahaSession: 's', providerSessionId: 'uid' })
    expect((await publicPost(wuzRequest('{'))).status).toBe(400)
  })

  it('does not schedule another response for a duplicate', async () => {
    mocks.findWuz.mockResolvedValue({ id: 'cfg', accountId: 'acc', wahaSession: 's', providerSessionId: 'uid' })
    mocks.ingest.mockResolvedValue({ ok: true, conversationId: 'conv', reason: 'duplicate' })
    await publicPost(wuzRequest())
    expect(mocks.agent).not.toHaveBeenCalled()
  })

  it('ingests a WuzAPI message for a WUZAPI account and notifies', async () => {
    mocks.findWuz.mockResolvedValue({
      id: 'cfg-wuz',
      accountId: 'acc-wuz',
      wahaSession: 'wuz_acc',
      providerSessionId: 'uid-1',
    })
    mocks.ingest.mockResolvedValue({ ok: true, conversationId: 'conv-wuz' })
    const res = await publicPost(wuzRequest())
    expect(res.status).toBe(200)
    expect(mocks.findWuz).toHaveBeenCalledWith('user-token')
    expect(mocks.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-wuz',
        payload: expect.objectContaining({ id: 'wuz-1', body: 'ping' }),
      }),
    )
    expect(mocks.notify).toHaveBeenCalled()
  })
})
