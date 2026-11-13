import { describe, expect, it } from 'vitest'
import { authConfig } from '@/auth.config'

function request(pathname: string) {
  return {
    nextUrl: new URL(`https://zapp.juspilot.com${pathname}`),
    headers: new Headers(),
  }
}

describe('auth gate', () => {
  it('lets the WhatsApp webhook through without a browser session', () => {
    const authorized = authConfig.callbacks.authorized
    for (const pathname of ['/webhook/whatsapp', '/api/whatsapp/webhook']) {
      expect(authorized({ auth: null, request: request(pathname) })).toBe(true)
    }
  })

  it('still sends anonymous inbox visits to login', () => {
    const authorized = authConfig.callbacks.authorized
    const result = authorized({ auth: null, request: request('/inbox') })
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(302)
    expect((result as Response).headers.get('location')).toContain('/login')
  })
})
