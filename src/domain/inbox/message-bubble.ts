const MEDIA = ['image', 'audio', 'video', 'document'] as const
type MediaKind = (typeof MEDIA)[number]

export function messageBubble(message: {
  content_type: string
  content_text: string | null
  media_url?: string | null
}): {
  kind: 'text' | MediaKind
  text: string | null
  url: string | null
} {
  const url = message.media_url ?? null
  const kind = MEDIA.find((item) => item === message.content_type)
  if (kind && url) {
    return { kind, text: message.content_text, url }
  }
  return { kind: 'text', text: message.content_text, url: null }
}
