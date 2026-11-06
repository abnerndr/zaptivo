import { prisma } from '@/domain/db/prisma'
import { normalizePhone } from '@/domain/whatsapp/phone-utils'
import { ensureContactAvatar } from '@/domain/whatsapp/ensure-contact-avatar'
import { resolveWhatsAppTransport } from '@/domain/whatsapp/resolve-transport'
import { WhatsAppTransportError } from '@/domain/whatsapp/transport'
import type { WuzapiTransport } from '@/domain/whatsapp/wuzapi-api'

export async function importWuzapiContacts(
  accountId: string,
): Promise<{ created: number; updated: number; skipped: number }> {
  const config = await prisma.whatsappConfig.findUnique({ where: { accountId } })
  if (!config || config.provider !== 'WUZAPI') {
    throw new WhatsAppTransportError('configuration', 'Account is not on WuzAPI')
  }

  const transport = await resolveWhatsAppTransport(accountId)
  if (transport.provider !== 'WUZAPI' || !('client' in transport) || !transport.client) {
    throw new WhatsAppTransportError('configuration', 'WuzAPI transport unavailable')
  }
  const client = transport.client as WuzapiTransport
  const contacts = await client.listContacts()

  let created = 0
  let updated = 0
  let skipped = 0

  for (const item of contacts) {
    const phoneNormalized = normalizePhone(item.phone)
    if (!phoneNormalized) {
      skipped += 1
      continue
    }

    const existing = await prisma.contact.findFirst({
      where: { accountId, phoneNormalized },
      select: { id: true, name: true, nameLocked: true },
    })

    if (!existing) {
      const row = await prisma.contact.create({
        data: {
          accountId,
          phone: phoneNormalized,
          phoneNormalized,
          name: item.name,
        },
        select: { id: true },
      })
      created += 1
      await ensureContactAvatar({
        accountId,
        contactId: row.id,
        session: config.wahaSession,
        phone: phoneNormalized,
      })
      continue
    }

    if (existing.nameLocked || !item.name) {
      skipped += 1
      await ensureContactAvatar({
        accountId,
        contactId: existing.id,
        session: config.wahaSession,
        phone: phoneNormalized,
      })
      continue
    }

    if (!existing.name) {
      await prisma.contact.update({
        where: { id: existing.id },
        data: { name: item.name },
      })
      updated += 1
    } else {
      skipped += 1
    }

    await ensureContactAvatar({
      accountId,
      contactId: existing.id,
      session: config.wahaSession,
      phone: phoneNormalized,
    })
  }

  return { created, updated, skipped }
}
