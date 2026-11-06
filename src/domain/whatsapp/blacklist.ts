import { prisma } from '@/domain/db/prisma'
import { resolveWhatsAppTransport } from '@/domain/whatsapp/resolve-transport'

export async function blockContact(accountId: string, contactId: string): Promise<void> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, accountId },
    select: { id: true, phone: true, blockedAt: true },
  })
  if (!contact) throw new Error('Contact not found')

  await prisma.contact.update({
    where: { id: contact.id },
    data: { blockedAt: contact.blockedAt ?? new Date() },
  })

  try {
    const transport = await resolveWhatsAppTransport(accountId)
    if (transport.provider === 'WUZAPI' && 'client' in transport && transport.client) {
      await transport.client.block(contact.phone)
    }
  } catch (err) {
    console.warn('[blacklist] provider block failed:', err)
  }
}

export async function unblockContact(accountId: string, contactId: string): Promise<void> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, accountId },
    select: { id: true, phone: true },
  })
  if (!contact) throw new Error('Contact not found')

  await prisma.contact.update({
    where: { id: contact.id },
    data: { blockedAt: null },
  })

  try {
    const transport = await resolveWhatsAppTransport(accountId)
    if (transport.provider === 'WUZAPI' && 'client' in transport && transport.client) {
      await transport.client.unblock(contact.phone)
    }
  } catch (err) {
    console.warn('[blacklist] provider unblock failed:', err)
  }
}
