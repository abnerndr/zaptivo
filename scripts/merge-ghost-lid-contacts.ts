/**
 * One-shot: merge ghost LID contacts that are junk suffixes of a real
 * BR phone contact (e.g. 551699635630251 → Matheus 5516996356302).
 */
import 'dotenv/config'
import { prisma } from '../src/lib/db/prisma'
import { isLikelyLid, isLikelyPhoneNumber } from '../src/lib/whatsapp/format-phone'
import { phonesMatch } from '../src/lib/whatsapp/phone-utils'
import { upgradeContactToPhone } from '../src/lib/whatsapp/resolve-lid'

async function main() {
  const accountId = process.argv[2] || '7aa78285-31db-431f-83fe-048a0ed32730'
  const contacts = await prisma.contact.findMany({
    where: { accountId },
    select: { id: true, phone: true, name: true },
  })

  const phones = contacts.filter((c) => isLikelyPhoneNumber(c.phone))
  const ghosts = contacts.filter(
    (c) => isLikelyLid(c.phone) || !isLikelyPhoneNumber(c.phone),
  )

  let merged = 0
  for (const ghost of ghosts) {
    const matches = phones.filter((p) => phonesMatch(p.phone, ghost.phone))
    if (matches.length !== 1) continue
    const target = matches[0]!
    console.log(
      `merge ${ghost.phone} (${ghost.name || '—'}) → ${target.phone} (${target.name || '—'})`,
    )
    await upgradeContactToPhone({
      accountId,
      contactId: ghost.id,
      phone: target.phone,
      name: target.name || ghost.name,
    })
    merged += 1
  }
  console.log(`done, merged=${merged}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
