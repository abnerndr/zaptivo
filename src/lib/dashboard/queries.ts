import { prisma } from "@/lib/db/prisma"

export async function getDashboardMetrics(accountId: string) {
  const [contacts, openConversations] = await Promise.all([
    prisma.contact.count({ where: { accountId } }),
    prisma.conversation.count({ where: { accountId, status: "open" } }),
  ])
  return { contacts, openConversations }
}
