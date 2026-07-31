import { prisma } from '@/lib/db/prisma'
import { notifyAccount } from '@/lib/db/notify'
import { getContactProfilePicture, toWahaChatId } from '@/lib/whatsapp/waha-api'
import { isLikelyPhoneNumber } from '@/lib/whatsapp/format-phone'

/**
 * If the contact has no avatar, fetch from WAHA and persist.
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

    const chatId = toWahaChatId(phone)
    const url = await getContactProfilePicture(args.session, chatId)
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
    console.warn('[ensureContactAvatar]', err)
  }
}
