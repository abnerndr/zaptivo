import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ account: vi.fn(), permissions: vi.fn(), put: vi.fn(), get: vi.fn() }))
vi.mock('@/domain/auth/context', () => ({ requireSessionAccount: mocks.account }))
vi.mock('@/domain/auth/org-roles', () => ({ getOrgRolePermissions: mocks.permissions }))
vi.mock('./storage', () => ({ putAudio: mocks.put, getAudio: mocks.get }))
import { POST } from './route'
import { GET } from './[id]/route'

const id = '00000000-0000-4000-8000-000000000001'
function clip() {
  const head = Buffer.alloc(19)
  head.write('OpusHead')
  head[8] = 1
  head[9] = 1
  const a = Buffer.alloc(28)
  a.write('OggS')
  a[5] = 2
  a[26] = 1
  a[27] = 19
  const b = Buffer.alloc(28)
  b.write('OggS')
  b[5] = 4
  b.writeBigUInt64LE(48000n, 6)
  b.writeUInt32LE(1, 18)
  b[26] = 1
  b[27] = 1
  return Buffer.concat([a, head, b, Buffer.from([1])])
}
function uploadRequest() {
  const form = new FormData()
  form.set('file', new File([clip()], 'voice.ogg', { type: 'audio/ogg' }))
  return new Request('http://localhost/api/media', { method: 'POST', body: form })
}

beforeEach(() => {
  mocks.account.mockResolvedValue({ accountId: 'org-a', role: 'agent', profile: { orgRoleId: null } })
  mocks.permissions.mockResolvedValue(new Set(['inbox.send']))
  mocks.put.mockResolvedValue(undefined)
  mocks.get.mockResolvedValue(clip())
})

describe('private audio routes', () => {
  it('uploads only after authorization and audio validation', async () => {
    const result = await POST(uploadRequest())
    expect(result.status).toBe(201)
    expect(mocks.put).toHaveBeenCalledWith('org-a', expect.any(String), expect.any(Buffer))
    expect((await result.json()).url).toMatch(/^\/api\/media\//)
  })
  it('rejects viewers and unauthenticated users', async () => {
    mocks.account.mockResolvedValueOnce({ accountId: 'org-a', role: 'viewer', profile: { orgRoleId: null } })
    expect((await POST(uploadRequest())).status).toBe(403)
    mocks.account.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }))
    expect((await GET(new Request('http://localhost'), { params: Promise.resolve({ id }) })).status).toBe(401)
  })
  it('accepts a multipart upload arriving in small delayed chunks', async () => {
    const original = uploadRequest()
    const bytes = new Uint8Array(await original.arrayBuffer())
    let offset = 0
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 1))
        if (offset >= bytes.length) return controller.close()
        controller.enqueue(bytes.slice(offset, offset + 64))
        offset += 64
      },
    })
    const request = new Request(original.url, {
      method: 'POST', headers: original.headers, body: stream, duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    expect((await POST(request)).status).toBe(201)
  })
  it('reads with the current session account, including another session of the same account', async () => {
    const result = await GET(new Request('http://localhost'), { params: Promise.resolve({ id }) })
    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.get).toHaveBeenCalledWith('org-a', id)
    mocks.account.mockResolvedValueOnce({ accountId: 'org-b', role: 'agent', profile: { orgRoleId: null } })
    mocks.get.mockResolvedValueOnce(null)
    expect((await GET(new Request('http://localhost'), { params: Promise.resolve({ id }) })).status).toBe(404)
    expect(mocks.get).toHaveBeenLastCalledWith('org-b', id)
  })
})
