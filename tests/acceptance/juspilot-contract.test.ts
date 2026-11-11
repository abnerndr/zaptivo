import { afterEach, describe, expect, it, vi } from 'vitest'
import { WuzapiTransport } from '../../src/domain/whatsapp/wuzapi-api'

// Synthetic responses. Assertions follow Juspilot's published spec.yml 3.0.0;
// they are not recordings or evidence of the deployed server's actual behavior.
afterEach(() => vi.unstubAllEnvs())
describe('Juspilot published request contract', () => {
  it('sends the documented token header on ordinary API requests', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { Id: 'synthetic-id' } })))
    const client = new WuzapiTransport({ baseUrl: 'https://example.invalid', token: 'synthetic-token', fetcher })
    await client.sendText({ to: '123', text: 'synthetic', operationId: 'synthetic-op' })
    const headers = new Headers(fetcher.mock.calls[0][1].headers)
    expect(headers.get('token')).toBe('synthetic-token')
  })
  it('registers webhook using documented webhook and events fields', async () => {
    vi.stubEnv('WUZAPI_WEBHOOK_URL', 'https://example.invalid/webhook/whatsapp')
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { webhook: 'https://example.invalid/webhook/whatsapp' } })))
    await new WuzapiTransport({ baseUrl: 'https://example.invalid', token: 'synthetic-token', fetcher }).connect()
    const body = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(body).toMatchObject({ webhook: 'https://example.invalid/webhook/whatsapp', events: expect.any(Array) })
  })
})
