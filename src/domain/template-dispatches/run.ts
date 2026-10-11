import { prisma } from '@/domain/db/prisma'
import { resolveConversation } from '@/domain/whatsapp/resolve-conversation'
import { sendMessageToConversation } from '@/domain/whatsapp/send-message'

const MAX_ERROR_LENGTH = 500

function truncateError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.slice(0, MAX_ERROR_LENGTH)
}

export async function runDispatch(
  dispatchId: string,
): Promise<{ sent: number; failed: number }> {
  const dispatch = await prisma.templateDispatch.findUnique({
    where: { id: dispatchId },
    include: {
      template: {
        select: { name: true, language: true, bodyText: true, status: true },
      },
      recipients: {
        where: { status: 'pending' },
        include: { contact: { select: { name: true, phone: true, typeId: true } } },
      },
    },
  })
  if (!dispatch) return { sent: 0, failed: 0 }

  const { template, recipients, accountId } = dispatch

  if (template.status !== 'ACTIVE') {
    await prisma.templateDispatch.update({
      where: { id: dispatchId },
      data: { status: 'failed' },
    })
    await prisma.templateDispatchRecipient.updateMany({
      where: { dispatchId, status: 'pending' },
      data: { status: 'failed', errorMessage: 'Template inválido' },
    })
    return { sent: 0, failed: recipients.length }
  }

  // Claim the dispatch so concurrent cron runs do not send twice.
  const claimed = await prisma.templateDispatch.updateMany({
    where: { id: dispatchId, status: { in: ['queued', 'scheduled'] } },
    data: { status: 'sending' },
  })
  if (claimed.count === 0) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0

  for (const recipient of recipients) {
    try {
      const { conversationId } = await resolveConversation({
        accountId,
        phone: recipient.contact.phone,
        contactName: recipient.contact.name,
      })
      await sendMessageToConversation(accountId, {
        conversationId,
        messageType: 'template',
        templateName: template.name,
        templateLanguage: template.language,
        contentText: template.bodyText,
      })
      await prisma.templateDispatchRecipient.update({
        where: { id: recipient.id },
        data: { status: 'sent', errorMessage: null },
      })
      sent++
    } catch (err) {
      await prisma.templateDispatchRecipient.update({
        where: { id: recipient.id },
        data: { status: 'failed', errorMessage: truncateError(err) },
      })
      failed++
    }
  }

  await prisma.templateDispatch.update({
    where: { id: dispatchId },
    data: { status: sent === 0 && failed > 0 ? 'failed' : 'sent' },
  })

  return { sent, failed }
}
