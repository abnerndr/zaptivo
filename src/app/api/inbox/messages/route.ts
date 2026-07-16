import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'

export async function GET(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const url = new URL(req.url)
    const conversationId = url.searchParams.get('conversationId')
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    }
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, accountId: ctx.accountId },
    })
    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })
    return NextResponse.json({
      messages: messages.map((m) => ({
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
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
