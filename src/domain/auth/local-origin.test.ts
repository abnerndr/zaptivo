import { describe, expect, it } from 'vitest'
import {
  applyLocalAuthGuard,
  localAuthRedirectBase,
} from './local-origin'

function headers(init: Record<string, string>) {
  return {
    get(name: string) {
      return init[name.toLowerCase()] ?? null
    },
  }
}

describe('applyLocalAuthGuard', () => {
  it('keeps a localhost AUTH_URL in development', () => {
    const env = {
      NODE_ENV: 'development',
      AUTH_URL: 'http://localhost:3000',
      AUTH_COOKIE_DOMAIN: '.juspilot.com',
    }
    applyLocalAuthGuard(env)
    expect(env.AUTH_URL).toBe('http://localhost:3000')
    expect(env.AUTH_COOKIE_DOMAIN).toBeUndefined()
  })

  it('drops a production AUTH_URL when NODE_ENV is local or development', () => {
    for (const nodeEnv of ['development', 'local', 'test']) {
      const env = {
        NODE_ENV: nodeEnv,
        AUTH_URL: 'https://zapp.juspilot.com',
        NEXTAUTH_URL: 'https://zapp.juspilot.com',
        AUTH_COOKIE_DOMAIN: '.juspilot.com',
      }
      applyLocalAuthGuard(env)
      expect(env.AUTH_URL).toBeUndefined()
      expect(env.NEXTAUTH_URL).toBeUndefined()
      expect(env.AUTH_COOKIE_DOMAIN).toBeUndefined()
    }
  })

  it('keeps production AUTH_URL and cookie domain', () => {
    const env = {
      NODE_ENV: 'production',
      AUTH_URL: 'https://zapp.juspilot.com',
      AUTH_COOKIE_DOMAIN: '.juspilot.com',
    }
    applyLocalAuthGuard(env)
    expect(env.AUTH_URL).toBe('https://zapp.juspilot.com')
    expect(env.AUTH_COOKIE_DOMAIN).toBe('.juspilot.com')
  })
})

describe('localAuthRedirectBase', () => {
  it('stays on localhost when Auth.js already rewrote the origin to production', () => {
    const base = localAuthRedirectBase({
      nodeEnv: 'development',
      nextOrigin: 'https://zapp.juspilot.com',
      headers: headers({ host: 'localhost:3000' }),
    })
    expect(new URL('/login', base).href).toBe('http://localhost:3000/login')
  })

  it('stays on localhost when NODE_ENV is local', () => {
    const base = localAuthRedirectBase({
      nodeEnv: 'local',
      nextOrigin: 'https://zapp.juspilot.com',
      headers: headers({
        host: 'localhost:3000',
        'x-forwarded-host': 'zapp.juspilot.com',
      }),
    })
    expect(base).toBe('http://localhost:3000')
  })

  it('follows the canonical origin in production', () => {
    const base = localAuthRedirectBase({
      nodeEnv: 'production',
      nextOrigin: 'https://zapp.juspilot.com',
      headers: headers({ host: 'localhost:3000' }),
    })
    expect(new URL('/dashboard', base).href).toBe(
      'https://zapp.juspilot.com/dashboard',
    )
  })
})
