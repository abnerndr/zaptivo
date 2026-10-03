import { NextResponse } from 'next/server'
import { requireSessionAccount } from '@/domain/auth/context'
import {
  sendMessageToConversation,
  SendMessageError,
} from '@/domain/whatsapp/send-message'

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await req.json()) as {
      conversation_id?: string
      message_type?: string
      content_text?: string
      media_url?: string
      filename?: string
      template_name?: string
      template_language?: string
      template_params?: string[]
      template_message_params?: unknown
      interactive_payload?: unknown
      reply_to_message_id?: string
    }

    const result = await sendMessageToConversation(ctx.accountId, {
      conversationId: body.conversation_id!,
      messageType: body.message_type!,
      contentText: body.content_text,
      mediaUrl: body.media_url,
      filename: body.filename,
      templateName: body.template_name,
      templateLanguage: body.template_language,
      templateParams: body.template_params,
      templateMessageParams: body.template_message_params,
      interactivePayload: body.interactive_payload as never,
      replyToMessageId: body.reply_to_message_id,
    })

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof SendMessageError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      )
    }
    console.error('[whatsapp/send]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
