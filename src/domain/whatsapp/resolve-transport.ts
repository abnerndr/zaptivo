import { prisma } from '@/domain/db/prisma'
import { readWhatsappCredential } from '../../../prisma/whatsapp-credential'
import { sendText as evolutionSendText } from './evolution-api'
import { WuzapiTransport } from './wuzapi-api'
import { WhatsAppTransportError } from './transport'

export async function resolveWhatsAppTransport(accountId: string) {
  const config = await prisma.whatsappConfig.findUnique({ where: { accountId } })
  if (!config) {
    throw new WhatsAppTransportError('configuration', 'WhatsApp not configured')
  }

  if (config.provider === 'WUZAPI') {
    const token = await readWhatsappCredential(accountId)
    if (!token) {
      throw new WhatsAppTransportError('configuration', 'WuzAPI account token is missing')
    }
    const client = new WuzapiTransport({ token })
    return {
      provider: 'WUZAPI' as const,
      session: config.providerSessionId ?? config.wahaSession,
      client,
      async sendText(to: string, text: string, operationId: string) {
        const result = await client.sendText({ to, text, operationId })
        return { remoteId: result.remoteId }
      },
    }
  }

  return {
    provider: 'EVOLUTION' as const,
    session: config.wahaSession,
    async sendText(to: string, text: string, _operationId: string) {
      const result = await evolutionSendText({
        instance: config.wahaSession,
        number: to,
        text,
      })
      return { remoteId: result.id }
    },
  }
}
