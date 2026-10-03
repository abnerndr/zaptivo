import { apiFetch } from '@/lib/api/client'
/**
 * Media upload helper — Cloudflare R2 via `/api/storage/upload`.
 * Path convention kept from Supabase era for compatibility:
 *   <kind>/account-<account_id>/<timestamp>-<basename>.<ext>
 */

export const MEDIA_MAX_BYTES = 16 * 1024 * 1024

export const MEDIA_MAX_BYTES_BY_KIND = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 16 * 1024 * 1024,
} as const

export function buildMediaPath(
  accountId: string,
  fileName: string,
  now: number = Date.now()
): string {
  const hasExt = /\.[^.]+$/.test(fileName)
  const ext = hasExt ? fileName.split('.').pop()!.toLowerCase() : 'bin'
  const safeBase =
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 40) || 'file'
  return `account-${accountId}/${now}-${safeBase}.${ext}`
}

export interface UploadAccountMediaResult {
  publicUrl: string
  path: string
}

/** Map legacy bucket names to R2 key prefixes. */
function kindFromBucket(bucket: string): string {
  if (bucket === 'avatars') return 'avatars'
  if (bucket === 'flow-media') return 'flow-media'
  return 'chat-media'
}

export async function uploadAccountMedia(
  bucket: string,
  file: File
): Promise<UploadAccountMediaResult> {
  const form = new FormData()
  form.set('file', file)
  form.set('kind', kindFromBucket(bucket))
  const res = await apiFetch('/api/storage/upload', { method: 'POST', body: form })
  const data = (await res.json()) as {
    error?: string
    publicUrl?: string
    path?: string
  }
  if (!res.ok || !data.publicUrl || !data.path) {
    throw new Error(data.error ?? 'Upload failed')
  }
  return { publicUrl: data.publicUrl, path: data.path }
}

export async function deleteAccountMedia(
  _bucket: string,
  path: string
): Promise<void> {
  const res = await apiFetch('/api/storage/upload', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? 'Delete failed')
  }
}
