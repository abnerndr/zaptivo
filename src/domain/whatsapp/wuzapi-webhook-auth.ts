import { timingSafeEqual } from 'crypto'
import { prisma } from '@/domain/db/prisma'
import { decrypt } from '@/domain/whatsapp/encryption'

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export type WuzapiWebhookAccount = {
  id: string
  accountId: string
  wahaSession: string
  providerSessionId: string | null
}

/** Resolve a WuzAPI account from the user token header. Never log the token. */
export async function findWuzapiAccountByToken(
  token: string | null,
): Promise<WuzapiWebhookAccount | null> {
  const trimmed = token?.trim()
  if (!trimmed) return null

  const rows = await prisma.whatsappConfig.findMany({
    where: { provider: 'WUZAPI', encryptedCredential: { not: null } },
    select: {
      id: true,
      accountId: true,
      wahaSession: true,
      providerSessionId: true,
      encryptedCredential: true,
    },
  })

  for (const row of rows) {
    if (!row.encryptedCredential) continue
    let plain: string
    try {
      plain = decrypt(row.encryptedCredential)
    } catch {
      continue
    }
    if (safeEqual(plain, trimmed)) {
      return {
        id: row.id,
        accountId: row.accountId,
        wahaSession: row.wahaSession,
        providerSessionId: row.providerSessionId,
      }
    }
  }
  return null
}
