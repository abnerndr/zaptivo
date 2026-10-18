import { prisma } from '@/domain/db/prisma'
import { notifyAccount } from '@/domain/db/notify'
import { messageInsertPayload } from '@/domain/realtime/payload'
import { decrypt } from '@/domain/whatsapp/encryption'
import { sendText } from '@/domain/whatsapp/evolution-api'
import { buildSystemPrompt } from '@/domain/ai/defaults'
import { buildHandoffSummary } from '@/domain/ai/handoff'
import { generateReply } from '@/domain/ai/generate'
import type { AiConfig, AiProvider, ChatMessage } from '@/domain/ai/types'
import { scheduleAgentJob } from '@/domain/whatsapp/agent-queue'

function asProvider(value: string): AiProvider | null {
  if (value === 'openai' || value === 'anthropic') return value
  return null
}

async function loadConfig(accountId: string): Promise<AiConfig | null> {
  const row = await prisma.aiConfig.findUnique({ where: { accountId } })
  if (!row) return null
  const provider = asProvider(row.provider)
  if (!provider || !row.isActive || !row.autoReplyEnabled) return null
  let apiKey = ''
  try {
    apiKey = decrypt(row.apiKey)
  } catch {
    return null
  }
  if (!apiKey) return null
  return {
    provider,
    model: row.model,
    apiKey,
    systemPrompt: row.systemPrompt,
    isActive: row.isActive,
    autoReplyEnabled: row.autoReplyEnabled,
    autoReplyMaxPerConversation: row.autoReplyMaxPerConversation,
    handoffAgentId: null,
    embeddingsApiKey: null,
  }
}

export async function runEvolutionAgent(args: {
  accountId: string
  conversationId: string
}): Promise<void> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: args.conversationId, accountId: args.accountId },
    include: { contact: true },
  })
  if (!conversation || conversation.aiAutoreplyDisabled) return

  const config = await loadConfig(args.accountId)
  if (!config) return
  if (conversation.aiReplyCount >= config.autoReplyMaxPerConversation) return

  const wa = await prisma.whatsappConfig.findUnique({
    where: { accountId: args.accountId },
  })
  if (!wa) return

  const rows = await prisma.message.findMany({
    where: { conversationId: conversation.id, contentType: 'text' },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  const messages: ChatMessage[] = []
  for (const row of rows.reverse()) {
    const content = row.contentText?.trim() ?? ''
    if (!content) continue
    messages.push({
      role: row.senderType === 'customer' ? 'user' : 'assistant',
      content,
    })
  }

  const generated = await generateReply({
    config,
    systemPrompt: buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
    }),
    messages,
  })

  if (generated.handoff) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        aiAutoreplyDisabled: true,
        aiHandoffSummary: buildHandoffSummary({
          messages,
          replyCount: conversation.aiReplyCount,
        }),
      },
    })
    return
  }

  const text = generated.text.trim()
  if (!text) return

  const sent = await sendText({
    instance: wa.wahaSession,
    number: conversation.contact.phone,
    text,
  })
  const createdAt = new Date()
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderType: 'bot',
      contentType: 'text',
      contentText: text,
      messageId: sent.id,
      status: 'sent',
      aiGenerated: true,
      createdAt,
    },
  })
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageText: text,
      lastMessageAt: createdAt,
      aiReplyCount: { increment: 1 },
    },
  })
  await notifyAccount(
    messageInsertPayload({
      id: message.id,
      accountId: args.accountId,
      conversationId: conversation.id,
      contactId: conversation.contactId,
      text,
      fromMe: true,
      contentType: 'text',
      mediaUrl: null,
      status: 'sent',
      createdAt,
    }),
  ).catch(() => {})
}

export async function applyEvolutionAgentPlan(args: {
  accountId: string
  conversationId: string
  action: 'ignore' | 'takeover' | 'enqueue'
}): Promise<void> {
  if (args.action === 'ignore') return
  if (args.action === 'takeover') {
    await prisma.conversation.update({
      where: { id: args.conversationId },
      data: { aiAutoreplyDisabled: true },
    })
    return
  }
  scheduleAgentJob(args.conversationId, () =>
    runEvolutionAgent({
      accountId: args.accountId,
      conversationId: args.conversationId,
    }),
  )
}
