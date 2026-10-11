import { MEDIA_MAX_BYTES_BY_KIND } from '@/domain/storage/upload-media'

export type OutgoingMessageType = 'image' | 'audio' | 'video' | 'document'

export function outgoingMediaKind(file: {
  type: string
  size: number
}): { messageType: OutgoingMessageType } | { error: string } {
  const mime = file.type
  if (!mime) return { error: 'Tipo de arquivo desconhecido' }

  const messageType: OutgoingMessageType = mime.startsWith('image/')
    ? 'image'
    : mime.startsWith('audio/')
      ? 'audio'
      : mime.startsWith('video/')
        ? 'video'
        : 'document'

  if (file.size > MEDIA_MAX_BYTES_BY_KIND[messageType]) {
    return { error: 'Arquivo grande demais' }
  }
  return { messageType }
}
