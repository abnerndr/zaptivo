import { prisma } from "@/lib/db/prisma"
import { sendMessageToConversation } from "@/lib/whatsapp/send-message"

export async function createBroadcast(accountId: string, input: Record<string, unknown>) {
  return prisma.broadcast.create({
    data: {
      accountId,
      name: String(input.name ?? "Broadcast"),
      templateName: String(input.template_name ?? "template"),
      templateLanguage: String(input.template_language ?? "pt_BR"),
      status: "draft",
    },
  })
}

export async function deliverBroadcast(accountId: string, broadcastId: string) {
  const broadcast = await prisma.broadcast.findFirst({ where: { id: broadcastId, accountId } })
  if (!broadcast) throw new Error("Broadcast not found")
  await prisma.broadcast.update({ where: { id: broadcastId }, data: { status: "sending" } })
  return { sent: 0, failed: 0 }
}
