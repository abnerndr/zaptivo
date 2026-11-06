import { afterEach, describe, expect, it, vi } from 'vitest'
import { evolutionWebhookUrl } from './evolution-api'
import { wuzapiWebhookUrl } from './wuzapi-api'

afterEach(() => vi.unstubAllEnvs())
describe('WhatsApp webhook URL', () => {
  it('derives the public origin with or without a trailing slash', () => {
    vi.stubEnv('EVOLUTION_WEBHOOK_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.com/app/')
    expect(evolutionWebhookUrl()).toBe('https://example.com/webhook/whatsapp')
    expect(wuzapiWebhookUrl()).toBe('https://example.com/webhook/whatsapp')
  })
  it('keeps explicit URLs literal including legacy callback paths', () => {
    vi.stubEnv('EVOLUTION_WEBHOOK_URL', 'https://example.com/api/whatsapp/webhook?secret=abc')
    expect(evolutionWebhookUrl()).toBe('https://example.com/api/whatsapp/webhook?secret=abc')
    vi.stubEnv('WUZAPI_WEBHOOK_URL', 'https://example.com/webhook/whatsapp/')
    expect(wuzapiWebhookUrl()).toBe('https://example.com/webhook/whatsapp/')
  })
  it('rejects missing, malformed and nonpublic production configuration', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('EVOLUTION_WEBHOOK_URL', '')
    for (const site of ['', 'not-a-url', 'http://example.com', 'https://localhost', 'https://192.168.0.1', 'https://[::1]']) {
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', site)
      expect(() => evolutionWebhookUrl()).toThrow()
    }
  })
})
