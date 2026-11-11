import { randomUUID } from 'node:crypto'
import { resolveWhatsAppTransport } from '@/domain/whatsapp/resolve-transport'

export async function engineSendText(args: {
  accountId: string
  phone: string
  text: string
}): Promise<{ messageId: string }> {
  const transport = await resolveWhatsAppTransport(args.accountId)
  const r = await transport.sendText(args.phone, args.text, randomUUID())
  return { messageId: r.remoteId }
}

export async function engineSendMedia(args: {
  accountId: string
  phone: string
  kind: 'image' | 'video' | 'document' | 'audio'
  url: string
  caption?: string
  filename?: string
}): Promise<{ messageId: string }> {
  throw new Error(`Envio de ${args.kind} via WuzAPI ainda não está habilitado neste caminho`)
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
