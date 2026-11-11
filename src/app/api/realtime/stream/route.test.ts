import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ clients: [] as Array<{ emit: (event: string, ...args: unknown[]) => boolean; end: ReturnType<typeof vi.fn> }>, user: 'agent-1', allowed: true }))
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: state.user } }) }))
vi.mock('@/domain/db/prisma', () => ({ prisma: { profile: { findFirst: async () => state.allowed ? {} : null } } }))
vi.mock('@/domain/db/listen-url', () => ({ listenConnectionString: () => 'postgres://test' }))
vi.mock('pg', async () => {
  const { EventEmitter } = await import('node:events')
  return { Client: class extends EventEmitter {
    connect = vi.fn(async () => {})
    query = vi.fn(async () => {})
    end = vi.fn(async () => {})
    constructor() { super(); state.clients.push(this) }
  } }
})
import { GET } from './route'

const org1 = '11111111-1111-1111-1111-111111111111'
const org2 = '22222222-2222-2222-2222-222222222222'
function request(account: string, signal?: AbortSignal) {
  return new Request(`http://localhost/api/realtime/stream?accountId=${account}`, { signal })
}
async function next(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value } = await reader.read()
  return value ? new TextDecoder().decode(value) : ''
}

describe('realtime streams', () => {
  beforeEach(() => { state.clients.length = 0; state.allowed = true; state.user = 'agent-1' })

  it('shares listeners across agents and tabs, isolates accounts, and releases on disconnect', async () => {
    const abort1 = new AbortController()
    const abort2 = new AbortController()
    const abort3 = new AbortController()
    const one = await GET(request(org1, abort1.signal))
    state.user = 'agent-2'
    const two = await GET(request(org1, abort2.signal))
    const other = await GET(request(org2, abort3.signal))
    const a = one.body!.getReader(), b = two.body!.getReader(), c = other.body!.getReader()
    expect(await next(a)).toContain('ready')
    expect(await next(b)).toContain('ready')
    expect(await next(c)).toContain('ready')
    expect(state.clients).toHaveLength(2)
    state.clients[0].emit('notification', { channel: `account_${org1.replace(/-/g, '_')}`, payload: JSON.stringify({ accountId: org2, text: 'forbidden' }) })
    state.clients[0].emit('notification', { channel: `account_${org1.replace(/-/g, '_')}`, payload: JSON.stringify({ accountId: org1, text: 'hello' }) })
    expect(await next(a)).toContain('hello')
    expect(await next(b)).toContain('hello')
    abort1.abort()
    expect(state.clients[0].end).not.toHaveBeenCalled()
    abort2.abort()
    abort3.abort()
    await vi.waitFor(() => expect(state.clients.every((client) => client.end.mock.calls.length === 1)).toBe(true))
  })

  it('reauthorizes each connection and cancels on a lost listener', async () => {
    state.allowed = false
    expect((await GET(request(org1))).status).toBe(403)
    state.allowed = true
    const response = await GET(request(org1))
    const reader = response.body!.getReader()
    await next(reader)
    ;state.clients[0].emit('error', new Error('lost'))
    expect((await reader.read()).done).toBe(true)
    state.allowed = false
    expect((await GET(request(org1))).status).toBe(403)
  })
})
