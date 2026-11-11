import { describe, it, expect, vi, afterEach } from 'vitest'
import { WuzapiAdmin, adminTokenFromEnv } from './wuzapi-admin'

afterEach(() => vi.unstubAllEnvs())

describe('adminTokenFromEnv', () => {
  it('prefers WUZAPI_ADMIN_TOKEN over WUZAPI_API_KEY', () => {
    vi.stubEnv('WUZAPI_ADMIN_TOKEN', 'admin')
    vi.stubEnv('WUZAPI_API_KEY', 'legacy')
    expect(adminTokenFromEnv()).toBe('admin')
  })
  it('falls back to WUZAPI_API_KEY', () => {
    vi.stubEnv('WUZAPI_ADMIN_TOKEN', '')
    vi.stubEnv('WUZAPI_API_KEY', 'legacy')
    expect(adminTokenFromEnv()).toBe('legacy')
  })
})

describe('WuzapiAdmin', () => {
  it('creates a user with Authorization admin header', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { id: 'uid-1', name: 'Acme', token: 'tok-1' },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const admin = new WuzapiAdmin({
      baseUrl: 'https://wuz.example/api',
      adminToken: 'adm',
      fetcher,
    })
    const user = await admin.createUser({
      name: 'Acme',
      token: 'tok-1',
      webhook: 'https://app.example/webhook/whatsapp',
    })
    expect(user).toEqual({ id: 'uid-1', name: 'Acme', token: 'tok-1' })
    const headers = new Headers(fetcher.mock.calls[0][1].headers)
    expect(headers.get('Authorization')).toBe('adm')
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toMatchObject({
      name: 'Acme',
      token: 'tok-1',
      webhook: 'https://app.example/webhook/whatsapp',
    })
  })

  it('lists users and keeps the phone jid', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [{ id: 'uid-1', name: 'juspilot', token: 'user-tok', connected: true, loggedIn: true, jid: '5516997720763@s.whatsapp.net' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const users = await new WuzapiAdmin({ baseUrl: 'https://wuz.example', adminToken: 'adm', fetcher }).listUsers()
    expect(users).toEqual([
      { id: 'uid-1', name: 'juspilot', token: 'user-tok', connected: true, loggedIn: true, jid: '5516997720763@s.whatsapp.net' },
    ])
  })

  it('reports a non-JSON admin body with the HTTP status', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('404 page not found\n', { status: 404, headers: { 'Content-Type': 'text/plain' } }))
    const admin = new WuzapiAdmin({ baseUrl: 'https://wuz.example/api', adminToken: 'adm', fetcher })
    await expect(admin.listUsers()).rejects.toThrow('Invalid WuzAPI admin response (HTTP 404: 404 page not found)')
  })
})
