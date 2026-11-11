import { prisma } from '@/domain/db/prisma'
import { notifyAccount } from '@/domain/db/notify'
import { uploadObject } from '@/domain/storage/r2'
import { resolveWhatsAppTransport } from '@/domain/whatsapp/resolve-transport'
import type { MediaDownload } from '@/domain/whatsapp/transport'

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

const SAFE_PUBLIC_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/ogg',
  'audio/mpeg',
  'video/mp4',
  'application/pdf',
])

/** Only known-safe types are served as-is from the public bucket. */
export function safePublicContentType(mime: string | null): string {
  const base = mime?.split(';')[0]?.trim().toLowerCase() ?? ''
  return SAFE_PUBLIC_TYPES.has(base) ? base : 'application/octet-stream'
}

export function inboundMediaKey(
  accountId: string,
  messageId: string,
  mimetype: string | null,
): string {
  return `chat-media/account-${accountId}/${messageId}.${extensionForMime(mimetype)}`
}

/**
 * Downloads inbound media through WuzAPI, stores it in R2 and tells the client
 * the final URL. Runs after the bubble was already shown.
 */
export async function settleInboundMedia(args: {
  accountId: string
  messageId: string
  conversationId: string
  media: MediaDownload
}): Promise<string> {
  const transport = await resolveWhatsAppTransport(args.accountId)
  const file = await transport.client.downloadMedia(args.media)
  const mime = args.media.mimeType || file.mimeType
  const key = inboundMediaKey(args.accountId, args.messageId, mime)
  const publicUrl = await uploadObject({
    key,
    body: Buffer.from(file.bytes),
    contentType: safePublicContentType(mime),
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
    contentType: mime,
  })
  return publicUrl
}
