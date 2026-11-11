import { afterEach, describe, expect, it, vi } from 'vitest'
import { wuzapiWebhookUrl } from './wuzapi-api'

afterEach(() => vi.unstubAllEnvs())
describe('WhatsApp webhook URL', () => {
  it('derives the public origin with or without a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.com/app/')
    expect(wuzapiWebhookUrl()).toBe('https://example.com/webhook/whatsapp')
  })
  it('keeps explicit URLs literal including legacy callback paths', () => {
    vi.stubEnv('WUZAPI_WEBHOOK_URL', 'https://example.com/webhook/whatsapp/')
    expect(wuzapiWebhookUrl()).toBe('https://example.com/webhook/whatsapp/')
  })
  it('rejects missing, malformed and nonpublic production configuration', () => {
    vi.stubEnv('NODE_ENV', 'production')
    for (const site of ['', 'not-a-url', 'http://example.com', 'https://localhost', 'https://192.168.0.1', 'https://[::1]']) {
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', site)
      expect(() => wuzapiWebhookUrl()).toThrow()
    }
  })
})
