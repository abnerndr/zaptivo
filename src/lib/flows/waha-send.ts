import { sendText, sendImage, sendFile, toChatId } from '@/lib/whatsapp/waha-api'
import { prisma } from '@/lib/db/prisma'

export async function engineSendText(args: {
  accountId: string
  phone: string
  text: string
}): Promise<{ messageId: string }> {
  const config = await prisma.whatsappConfig.findUnique({
    where: { accountId: args.accountId },
  })
  if (!config) throw new Error('WhatsApp not configured')
  const r = await sendText({
    session: config.wahaSession,
    chatId: toChatId(args.phone),
    text: args.text,
  })
  return { messageId: r.id }
}

export async function engineSendMedia(args: {
  accountId: string
  phone: string
  kind: 'image' | 'video' | 'document' | 'audio'
  url: string
  caption?: string
  filename?: string
}): Promise<{ messageId: string }> {
  const config = await prisma.whatsappConfig.findUnique({
    where: { accountId: args.accountId },
  })
  if (!config) throw new Error('WhatsApp not configured')
  const chatId = toChatId(args.phone)
  if (args.kind === 'image') {
    const r = await sendImage({
      session: config.wahaSession,
      chatId,
      file: { url: args.url, filename: args.filename },
      caption: args.caption,
    })
    return { messageId: r.id }
  }
  const r = await sendFile({
    session: config.wahaSession,
    chatId,
    file: { url: args.url, filename: args.filename },
    caption: args.caption,
  })
  return { messageId: r.id }
}

export async function engineSendInteractiveButtons(args: {
  accountId: string
  phone: string
  bodyText: string
  buttons: Array<{ id: string; title: string }>
  headerText?: string
  footerText?: string
}): Promise<{ messageId: string }> {
  const lines = [
    args.headerText,
    args.bodyText,
    ...args.buttons.map((b, i) => `${i + 1}. ${b.title}`),
    args.footerText,
  ]
    .filter(Boolean)
    .join('\n')
  return engineSendText({
    accountId: args.accountId,
    phone: args.phone,
    text: lines,
  })
}

export async function engineSendInteractiveList(args: {
  accountId: string
  phone: string
  bodyText: string
  buttonLabel: string
  sections: Array<{
    title?: string
    rows: Array<{ id: string; title: string; description?: string }>
  }>
  headerText?: string
  footerText?: string
}): Promise<{ messageId: string }> {
  const rows = args.sections.flatMap((s) =>
    s.rows.map((r) => `- ${r.title}${r.description ? `: ${r.description}` : ''}`)
  )
  const text = [args.headerText, args.bodyText, args.buttonLabel, ...rows, args.footerText]
    .filter(Boolean)
    .join('\n')
  return engineSendText({
    accountId: args.accountId,
    phone: args.phone,
    text,
  })
}
