import { describe, expect, it, vi, afterEach } from 'vitest'
import { WuzapiTransport } from './wuzapi-api'

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
afterEach(() => vi.unstubAllEnvs())
describe('WuzAPI adapter', () => {
  it('sends the user token in the token header', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      json({ success: true, data: { connected: true, loggedIn: true } }),
    )
    const client = new WuzapiTransport({
      baseUrl: 'https://wuz.example/api',
      token: 'user-secret',
      fetcher,
    })
    await client.status()
    const init = fetcher.mock.calls[0][1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('token')).toBe('user-secret')
    expect(headers.get('Authorization')).toBeNull()
  })

  it('passes operation ID, LID and quote and encodes Opus at the edge', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ success: true, data: { Id: 'op' } }))
    const client = new WuzapiTransport({ baseUrl: 'https://wuz.example', token: 'secret', fetcher })
    expect(await client.sendAudio({ to: '123@lid', operationId: 'op', opus: new Uint8Array([1, 2]), voice: true, quote: { messageId: 'old', participant: '123@lid' } })).toEqual({ operationId: 'op', remoteId: 'op' })
    const request = fetcher.mock.calls[0][1]
    expect(request.headers).toMatchObject({ token: 'secret', 'X-Correlation-ID': 'op' })
    expect(JSON.parse(request.body)).toMatchObject({ Phone: '123@lid', Id: 'op', Audio: 'data:audio/ogg;base64,AQI=', ptt: true, ContextInfo: { StanzaId: 'old', Participant: '123@lid' } })
  })
  it('normalizes HTTP, provider and network errors without leaking response bodies', async () => {
    for (const [response, code] of [[json({ error: 'secret' }, 401), 'authentication'], [json({ error: 'secret' }, 503), 'provider'], [json({ success: false, error: 'secret' }), 'provider']] as const) {
      const client = new WuzapiTransport({ baseUrl: 'https://wuz.example', token: 'token', fetcher: vi.fn().mockResolvedValue(response) })
      await expect(client.sendText({ to: '1', text: 'x', operationId: 'op' })).rejects.toMatchObject({ code, operationId: 'op', message: expect.not.stringContaining('secret') })
    }
    const client = new WuzapiTransport({ baseUrl: 'https://wuz.example', token: 'token', fetcher: vi.fn().mockRejectedValue(new Error('secret')) })
    await expect(client.sendText({ to: '1', text: 'x', operationId: 'op' })).rejects.toMatchObject({ code: 'network', outcomeUnknown: true })
  })
  it('marks a timed out send as uncertain', async () => {
    const fetcher: typeof fetch = (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    const client = new WuzapiTransport({ baseUrl: 'https://wuz.example', token: 'token', timeoutMs: 5, fetcher })
    await expect(client.sendText({ to: '1', text: 'x', operationId: 'op' })).rejects.toMatchObject({ code: 'timeout', operationId: 'op', outcomeUnknown: true })
  })
  it('registers webhook with webhook + events and verifies readback', async () => {
    vi.stubEnv('WUZAPI_WEBHOOK_URL', 'https://app.example/webhook/whatsapp')
    const calls: Array<{ path: string; body?: unknown }> = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        path: new URL(url).pathname,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      if (init?.method === 'POST' && String(url).includes('/webhook')) {
        return json({
          success: true,
          data: {
            WebhookURL: 'https://app.example/webhook/whatsapp',
            Events: ['Message', 'ReadReceipt'],
          },
        })
      }
      if (String(url).includes('/webhook')) {
        return json({
          success: true,
          data: {
            webhook: 'https://app.example/webhook/whatsapp',
            subscribe: ['Message', 'ReadReceipt'],
          },
        })
      }
      return json({ success: true, data: { details: 'Connected!' } })
    })
    await new WuzapiTransport({ baseUrl: 'https://wuz.example', token: 't', fetcher }).connect()
    const setCall = calls.find((c) => c.body && typeof c.body === 'object')
    expect(setCall?.body).toMatchObject({ webhook: 'https://app.example/webhook/whatsapp' })
  })
})
