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

const event = JSON.stringify({
  event: 'messages.upsert',
  instance: 'shop',
  data: {
    key: { id: 'remote-1', remoteJid: '5511999999999@s.whatsapp.net' },
    message: { conversation: 'hello' },
  },
})

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

function request(path: string, body = event, secret = 'secret') {
  return new Request(`https://example.test${path}`, {
    method: 'POST',
    headers: { apikey: secret, 'content-type': 'application/json' },
    body,
  })
}

function wuzRequest(body = wuzMessage, token = 'user-token') {
  return new Request('https://example.test/webhook/whatsapp', {
    method: 'POST',
    headers: { token, 'content-type': 'application/json' },
    body,
  })
}

describe('WhatsApp webhook routes', () => {
  beforeEach(() => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secret'
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

  it('calls the same handler with the original request, including auth and body', async () => {
    expect(publicPost).toBe(apiPost)
    expect((await publicPost(request('/webhook/whatsapp', event, 'wrong'))).status).toBe(401)
    expect(mocks.findUnique).not.toHaveBeenCalled()
    mocks.ingest.mockResolvedValue({ ok: true, conversationId: 'conversation' })
    expect((await publicPost(request('/webhook/whatsapp'))).status).toBe(200)
    expect(mocks.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account',
        payload: expect.objectContaining({ id: 'remote-1', body: 'hello' }),
      }),
    )
  })

  it('does not schedule another agent response when the inbox reports a duplicate', async () => {
    mocks.ingest
      .mockResolvedValueOnce({ ok: true, conversationId: 'conversation' })
      .mockResolvedValueOnce({
        ok: true,
        conversationId: 'conversation',
        reason: 'duplicate',
      })
    await apiPost(request('/api/whatsapp/webhook'))
    await publicPost(request('/webhook/whatsapp'))
    expect(mocks.agent).toHaveBeenCalledTimes(1)
  })

  it('rejects an Evolution identifier belonging to another provider', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'config',
      accountId: 'account',
      provider: 'WUZAPI',
    })
    expect((await apiPost(request('/api/whatsapp/webhook'))).status).toBe(404)
    expect(mocks.ingest).not.toHaveBeenCalled()
  })

  it('rejects malformed bodies after authentication', async () => {
    expect((await publicPost(request('/webhook/whatsapp', '{'))).status).toBe(400)
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
