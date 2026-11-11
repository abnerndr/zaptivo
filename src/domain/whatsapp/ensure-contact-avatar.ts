import { prisma } from '@/domain/db/prisma'
import { notifyAccount } from '@/domain/db/notify'
import { isLikelyPhoneNumber } from '@/domain/whatsapp/format-phone'
import { resolveWhatsAppTransport } from '@/domain/whatsapp/resolve-transport'

const notedAvatarFailures = new Set<string>()

function warnAvatarFailure(err: unknown): void {
  const message = err instanceof Error ? err.message : 'failed'
  if (notedAvatarFailures.has(message)) return
  notedAvatarFailures.add(message)
  console.warn(`[ensureContactAvatar] ${message}`)
}

/**
 * If the contact has no avatar, fetch from the account provider and persist.
 * Never throws — safe to call from webhook/sync paths.
 */
export async function ensureContactAvatar(args: {
  accountId: string
  contactId: string
  session: string
  phone: string
}): Promise<void> {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: args.contactId, accountId: args.accountId },
      select: { avatarUrl: true, phone: true },
    })
    if (!contact || contact.avatarUrl) return

    const phone = contact.phone || args.phone
    if (!isLikelyPhoneNumber(phone) && !phone.includes('@')) return

    const transport = await resolveWhatsAppTransport(args.accountId)
    if (transport.provider !== 'WUZAPI' || !('client' in transport) || !transport.client) {
      return
    }

    const url = await transport.client.avatar(phone, true)
    if (!url) return

    const updated = await prisma.contact.updateMany({
      where: {
        id: args.contactId,
        accountId: args.accountId,
        OR: [{ avatarUrl: null }, { avatarUrl: '' }],
      },
      data: { avatarUrl: url },
    })
    if (updated.count > 0) {
      await notifyAccount({
        table: 'conversations',
        op: 'UPDATE',
        id: args.contactId,
        accountId: args.accountId,
      }).catch(() => {})
    }
  } catch (err) {
    warnAvatarFailure(err)
  }
}
