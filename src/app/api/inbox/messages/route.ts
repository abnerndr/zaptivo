import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'
import { normalizeWahaMessageId } from '@/domain/whatsapp/message-id'

function dedupeKey(m: {
  messageId: string | null
  senderType: string
  contentText: string | null
  createdAt: Date
}): string {
  const id = normalizeWahaMessageId(m.messageId)
  if (id) return `id:${id}`
  const t = m.createdAt.getTime()
  // bucket to 30s so near-duplicates collapse
  const bucket = Math.floor(t / 30_000)
  return `soft:${m.senderType}|${m.contentText ?? ''}|${bucket}`
}

export async function GET(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const url = new URL(req.url)
    const conversationId = url.searchParams.get('conversationId')
    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId required' },
        { status: 400 },
      )
    }
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, accountId: ctx.accountId },
    })
    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 400,
    })

    const seen = new Set<string>()
    const unique = []

    for (const m of messages) {
      const key = dedupeKey(m)
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(m)
    }

    return NextResponse.json(
      {
        messages: unique.map((m) => ({
          id: m.id,
          conversation_id: m.conversationId,
          sender_type: m.senderType,
          content_type: m.contentType,
          content_text: m.contentText,
          media_url: m.mediaUrl,
          status: m.status,
          message_id: m.messageId,
          created_at: m.createdAt.toISOString(),
          interactive_payload: m.interactivePayload,
          reply_to_message_id: m.replyToMessageId,
        })),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    )
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
