import 'server-only'

import { prisma } from '@/domain/db/prisma'
import { decrypt, encrypt } from '@/domain/whatsapp/encryption'

/** Call only after authorizing access to the account. Null clears the credential. */
export async function storeWhatsappCredential(accountId: string, credential: string | null): Promise<void> {
  await prisma.whatsappConfig.update({
    where: { accountId },
    data: { encryptedCredential: credential === null ? null : encrypt(credential) },
    select: { id: true },
  })
}

/** Returns plaintext only to trusted server code; do not include it in responses or logs. */
export async function readWhatsappCredential(accountId: string): Promise<string | null> {
  const row = await prisma.whatsappConfig.findUniqueOrThrow({
    where: { accountId },
    select: { encryptedCredential: true },
  })
  return row.encryptedCredential === null ? null : decrypt(row.encryptedCredential)
}
