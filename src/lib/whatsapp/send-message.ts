import {
  sendText,
  sendImage,
  sendFile,
  toChatId,
} from '@/lib/whatsapp/waha-api'
import {
  validateInteractivePayload,
  interactivePayloadPreviewText,
  type InteractiveMessagePayload,
} from '@/lib/whatsapp/interactive'
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils'
import { prisma } from '@/lib/db/prisma'
import { notifyAccount } from '@/lib/db/notify'

export const MEDIA_KINDS = ['image', 'video', 'document', 'audio'] as const
export const VALID_MESSAGE_TYPES = [
  'text',
  'template',
  'interactive',
  ...MEDIA_KINDS,
] as const

export class SendMessageError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'SendMessageError'
    this.code = code
    this.status = status
  }
}

export interface SendMessageParams {
  conversationId: string
  messageType: string
  contentText?: string | null
  mediaUrl?: string | null
  filename?: string | null
  templateName?: string | null
  templateLanguage?: string | null
  templateParams?: string[]
  templateMessageParams?: unknown
  interactivePayload?: InteractiveMessagePayload | null
  replyToMessageId?: string | null
}

export interface SendMessageResult {
  messageId: string
  whatsappMessageId: string
}

function renderTemplateBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '')
}

export function validateSendMessageParams(params: {
  messageType: string
  contentText?: string | null
  mediaUrl?: string | null
  templateName?: string | null
  interactivePayload?: InteractiveMessagePayload | null
}): void {
  const { messageType, contentText, mediaUrl, templateName, interactivePayload } =
    params

  if (!messageType) {
    throw new SendMessageError('bad_request', 'message_type is required', 400)
  }

  const isMediaKind = (MEDIA_KINDS as readonly string[]).includes(messageType)

  if (!(VALID_MESSAGE_TYPES as readonly string[]).includes(messageType)) {
    throw new SendMessageError(
      'bad_request',
      `Unsupported message_type "${messageType}"`,
      400
    )
  }

  if (messageType === 'text' && !contentText) {
    throw new SendMessageError(
      'bad_request',
      'content_text is required for text messages',
      400
    )
  }

  if (messageType === 'template' && !templateName) {
    throw new SendMessageError(
      'bad_request',
      'template_name is required for template messages',
      400
    )
  }

  if (messageType === 'interactive') {
    const result = validateInteractivePayload(interactivePayload)
    if (!result.ok) {
      throw new SendMessageError('bad_request', result.error, 400)
    }
  }

  if (isMediaKind && !mediaUrl) {
    throw new SendMessageError(
      'bad_request',
      `media_url is required for ${messageType} messages`,
      400
    )
  }

  if (
    isMediaKind &&
    messageType !== 'audio' &&
    typeof contentText === 'string' &&
    contentText.length > 1024
  ) {
    throw new SendMessageError(
      'bad_request',
      'Caption exceeds the 1024-character limit',
      400
    )
  }
}

/**
 * Send a message via WAHA and persist it.
 * Signature keeps optional first arg for backwards compat (ignored if PrismaClient-like).
 */
export async function sendMessageToConversation(
  accountIdOrDb: string | unknown,
  accountIdOrParams?: string | SendMessageParams,
  maybeParams?: SendMessageParams
): Promise<SendMessageResult> {
  let accountId: string
  let params: SendMessageParams

  if (typeof accountIdOrDb === 'string') {
    accountId = accountIdOrDb
    params = accountIdOrParams as SendMessageParams
  } else {
    accountId = accountIdOrParams as string
    params = maybeParams as SendMessageParams
  }

  const {
    conversationId,
    messageType,
    contentText,
    mediaUrl,
    filename,
    templateName,
    templateLanguage,
    templateParams,
    interactivePayload,
    replyToMessageId,
  } = params

  if (!conversationId) {
    throw new SendMessageError('bad_request', 'conversation_id is required', 400)
  }

  validateSendMessageParams({
    messageType,
    contentText,
    mediaUrl,
    templateName,
    interactivePayload,
  })

  const isMediaKind = (MEDIA_KINDS as readonly string[]).includes(messageType)

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, accountId },
    include: { contact: true },
  })

  if (!conversation) {
    throw new SendMessageError('not_found', 'Conversation not found', 404)
  }

  const contact = conversation.contact
  if (!contact?.phone) {
    throw new SendMessageError(
      'bad_request',
      'Contact phone number not found',
      400
    )
  }

  const sanitizedPhone = sanitizePhoneForMeta(contact.phone)
  if (!isValidE164(sanitizedPhone)) {
    throw new SendMessageError('bad_request', 'Invalid phone number format', 400)
  }

  const config = await prisma.whatsappConfig.findUnique({
    where: { accountId },
  })

  if (!config) {
    throw new SendMessageError(
      'whatsapp_not_configured',
      'WhatsApp not configured. Please set up your WhatsApp integration first.',
      400
    )
  }

  if (config.status !== 'WORKING') {
    throw new SendMessageError(
      'whatsapp_not_ready',
      `WhatsApp session is ${config.status}. Scan QR and wait until WORKING.`,
      400
    )
  }

  let textToSend = contentText ?? ''

  if (messageType === 'template' && templateName) {
    const template = await prisma.messageTemplate.findFirst({
      where: {
        accountId,
        name: templateName,
        language: templateLanguage || 'pt_BR',
      },
    })
    if (!template) {
      throw new SendMessageError('not_found', 'Template not found', 404)
    }
    textToSend = renderTemplateBody(template.bodyText, templateParams || [])
  }

  if (messageType === 'interactive' && interactivePayload) {
    const preview = interactivePayloadPreviewText(interactivePayload)
    textToSend = preview
  }

  const attempt = async (phone: string): Promise<string> => {
    const chatId = toChatId(phone)
    const session = config.wahaSession

    if (isMediaKind && mediaUrl) {
      if (messageType === 'image') {
        const r = await sendImage({
          session,
          chatId,
          file: { url: mediaUrl, filename: filename || undefined },
          caption: contentText || undefined,
        })
        return r.id
      }
      const r = await sendFile({
        session,
        chatId,
        file: {
          url: mediaUrl,
          filename: filename || undefined,
          mimetype: undefined,
        },
        caption: contentText || undefined,
      })
      return r.id
    }

    const r = await sendText({ session, chatId, text: textToSend })
    return r.id
  }

  let waMessageId = ''
  let workingPhone = sanitizedPhone
  try {
    const variants = phoneVariants(sanitizedPhone)
    let lastError: unknown = null

    for (const variant of variants) {
      try {
        waMessageId = await attempt(variant)
        workingPhone = variant
        lastError = null
        break
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!isRecipientNotAllowedError(message)) {
          throw err
        }
        lastError = err
      }
    }

    if (lastError) throw lastError
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown WAHA error'
    console.error('[send-message] WAHA send failed:', message)
    throw new SendMessageError('waha_error', `WAHA error: ${message}`, 502)
  }

  if (workingPhone !== sanitizedPhone) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { phone: workingPhone },
    })
  }

  const interactiveBody =
    messageType === 'interactive' ? interactivePayload!.body : null

  const messageRecord = await prisma.message.create({
    data: {
      conversationId,
      senderType: 'agent',
      contentType: messageType,
      contentText: interactiveBody ?? (messageType === 'template' ? textToSend : contentText) ?? null,
      mediaUrl: mediaUrl || null,
      templateName: templateName || null,
      interactivePayload:
        messageType === 'interactive' ? (interactivePayload as object) : undefined,
      messageId: waMessageId,
      status: 'sent',
      replyToMessageId: replyToMessageId || null,
    },
  })

  const lastMessageText =
    messageType === 'interactive'
      ? interactivePayloadPreviewText(interactivePayload!)
      : messageType === 'template'
        ? textToSend
        : contentText || `[${messageType}]`

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageText,
      lastMessageAt: new Date(),
    },
  })

  try {
    await prisma.flowRun.updateMany({
      where: {
        accountId,
        contactId: contact.id,
        status: 'active',
      },
      data: {
        status: 'paused_by_agent',
        endedAt: new Date(),
        endReason: 'agent_replied',
      },
    })
  } catch (err) {
    console.error(
      '[flows] pause-on-agent-send threw:',
      err instanceof Error ? err.message : err
    )
  }

  await notifyAccount({
    table: 'messages',
    op: 'INSERT',
    id: messageRecord.id,
    accountId,
  }).catch(() => {})

  return { messageId: messageRecord.id, whatsappMessageId: waMessageId }
}
