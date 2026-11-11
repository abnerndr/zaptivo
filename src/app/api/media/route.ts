import { randomUUID } from 'node:crypto'
import { requireSessionAccount } from '@/domain/auth/context'
import { getOrgRolePermissions } from '@/domain/auth/org-roles'
import { canSendMessages } from '@/domain/auth/roles'
import { MAX_AUDIO_BYTES, validateAudio } from './audio'
import { putAudio } from './storage'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const permissions = await getOrgRolePermissions(ctx.profile.orgRoleId)
    if (ctx.role === 'viewer' || !canSendMessages({ accountRole: ctx.role, permissions })) return Response.json({ error: 'Forbidden' }, { status: 403 })
    const contentLength = Number(req.headers.get('content-length'))
    const maxRequestBytes = MAX_AUDIO_BYTES + 65536
    if (contentLength > maxRequestBytes) return Response.json({ error: 'File too large' }, { status: 413 })
    if (!req.body) return Response.json({ error: 'File required' }, { status: 400 })
    const reader = req.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxRequestBytes) {
        await reader.cancel()
        return Response.json({ error: 'File too large' }, { status: 413 })
      }
      chunks.push(value)
    }
    let form: FormData
    try {
      form = await new Request(req.url, { method: 'POST', headers: req.headers, body: Buffer.concat(chunks) }).formData()
    } catch { return Response.json({ error: 'Invalid multipart form' }, { status: 400 }) }
    const file = form.get('file')
    if (!(file instanceof File)) return Response.json({ error: 'File required' }, { status: 400 })
    const bytes = Buffer.from(await file.arrayBuffer())
    let duration: number
    try { duration = validateAudio(bytes, file.type) } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Invalid audio' }, { status: 400 })
    }
    const id = randomUUID()
    await putAudio(ctx.accountId, id, bytes)
    return Response.json({ id, url: `/api/media/${id}`, duration }, { status: 201 })
  } catch (error) {
    if (error instanceof Response) return error
    console.error('[media/upload]', error)
    return Response.json({ error: 'Media upload failed' }, { status: 500 })
  }
}
