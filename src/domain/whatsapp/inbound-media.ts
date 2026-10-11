import { prisma } from '@/domain/db/prisma'
import { notifyAccount } from '@/domain/db/notify'
import { uploadObject } from '@/domain/storage/r2'
import { downloadWahaMedia } from '@/domain/whatsapp/waha-api'

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
}

export function extensionForMime(mimetype: string | null): string {
  if (!mimetype) return 'bin'
  const base = mimetype.split(';')[0]?.trim().toLowerCase() ?? ''
  return EXTENSIONS[base] ?? 'bin'
}

export function inboundMediaKey(
  accountId: string,
  messageId: string,
  mimetype: string | null,
): string {
  return `chat-media/account-${accountId}/${messageId}.${extensionForMime(mimetype)}`
}

/**
 * The WAHA API key may only go to WAHA itself: true when the media url
 * (absolute, or relative to the base) has the same origin as `baseUrl`.
 * downloadWahaMedia refuses (throws, no fetch) when this is false.
 */
export function shouldSendWahaKey(
  mediaUrl: string,
  baseUrl: string | undefined,
): boolean {
  if (!baseUrl) return false
  try {
    const base = new URL(baseUrl)
    const target = mediaUrl.startsWith('http')
      ? new URL(mediaUrl)
      : new URL(mediaUrl, base)
    return target.origin === base.origin
  } catch {
    return false
  }
}

/**
 * Downloads inbound media from WAHA, stores it in R2 and tells the client
 * the final URL. Runs after the bubble was already shown.
 */
export async function settleInboundMedia(args: {
  accountId: string
  messageId: string
  conversationId: string
  mediaUrl: string
  mimetype: string | null
  session: string
}): Promise<string> {
  const file = await downloadWahaMedia({
    url: args.mediaUrl,
    session: args.session,
  })
  const mime = args.mimetype || file.contentType
  const key = inboundMediaKey(args.accountId, args.messageId, mime)
  const publicUrl = await uploadObject({
    key,
    body: file.body,
    contentType: mime,
  })
  const updated = await prisma.message.update({
    where: { id: args.messageId },
    data: { mediaUrl: publicUrl },
    select: { conversationId: true },
  })
  await notifyAccount({
    table: 'messages',
    op: 'UPDATE',
    id: args.messageId,
    accountId: args.accountId,
    // The thread may have changed while the download was in flight.
    conversationId: updated.conversationId ?? args.conversationId,
    mediaUrl: publicUrl,
    contentType: args.mimetype ?? undefined,
  })
  return publicUrl
}
