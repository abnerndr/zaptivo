import { prisma } from '@/domain/db/prisma';
import { readWhatsappCredential } from '../../../prisma/whatsapp-credential';
import { WuzapiTransport } from './wuzapi-api';
import { WhatsAppTransportError } from './transport';

export async function resolveWhatsAppTransport(accountId: string) {
  const config = await prisma.whatsappConfig.findUnique({
    where: { accountId },
  });
  if (!config) {
    throw new WhatsAppTransportError(
      'configuration',
      'WhatsApp not configured'
    );
  }

  if (config.provider !== 'WUZAPI') {
    throw new WhatsAppTransportError(
      'configuration',
      'Vincule o WhatsApp à WuzAPI'
    );
  }
  const token = await readWhatsappCredential(accountId);
  if (!token) {
    throw new WhatsAppTransportError(
      'configuration',
      'WuzAPI account token is missing'
    );
  }
  const client = new WuzapiTransport({ token });
  return {
    provider: 'WUZAPI' as const,
    session: config.providerSessionId ?? config.wahaSession,
    client,
    async sendText(to: string, text: string, operationId: string) {
      const result = await client.sendText({ to, text, operationId });
      return { remoteId: result.remoteId };
    },
  };
}
