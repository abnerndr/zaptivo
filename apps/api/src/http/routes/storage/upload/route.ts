import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { uploadObject, deleteObject } from '@/lib/storage/r2'
import { buildMediaPath, MEDIA_MAX_BYTES } from '@/lib/storage/upload-media'

const ALLOWED_KINDS = new Set(['chat-media', 'flow-media', 'avatars'])

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await req.formData()
  const file = form.get('file')
  const kind = String(form.get('kind') ?? 'chat-media')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 })
  }
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: 'invalid kind' }, { status: 400 })
  }
  if (file.size > MEDIA_MAX_BYTES) {
    return NextResponse.json({ error: 'file too large' }, { status: 400 })
  }

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
  })
  if (!profile) {
    return NextResponse.json({ error: 'profile not found' }, { status: 404 })
  }

  const relative = buildMediaPath(
    kind === 'avatars' ? session.user.id : profile.accountId,
    file.name
  )
  const key = `${kind}/${relative}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const publicUrl = await uploadObject({
    key,
    body: buffer,
    contentType: file.type || 'application/octet-stream',
  })

  return NextResponse.json({ publicUrl, path: key })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { path } = (await req.json()) as { path?: string }
  if (!path) {
    return NextResponse.json({ error: 'path required' }, { status: 400 })
  }
  await deleteObject(path)
  return NextResponse.json({ ok: true })
}
