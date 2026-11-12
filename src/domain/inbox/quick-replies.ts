import { Prisma, type QuickReply } from '@prisma/client'
import { validateInteractivePayload } from '@/domain/whatsapp/interactive'

export function serializeQuickReply(row: QuickReply) {
  return {
    id: row.id,
    account_id: row.accountId,
    user_id: row.userId,
    title: row.title,
    kind: row.kind,
    content_text: row.contentText,
    interactive_payload: row.interactivePayload,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export function parseQuickReply(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Dados inválidos' } as const
  const body = input as Record<string, unknown>
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title || title.length > 200) return { error: 'Informe um nome de até 200 caracteres' } as const
  if (body.kind === 'text') {
    if (typeof body.content_text !== 'string' || !body.content_text.trim()) return { error: 'Informe o texto da mensagem' } as const
    return { data: { title, kind: 'text', contentText: body.content_text.trim(), interactivePayload: Prisma.DbNull } } as const
  }
  if (body.kind === 'interactive') {
    const result = validateInteractivePayload(body.interactive_payload)
    if (!result.ok) return { error: result.error } as const
    return { data: { title, kind: 'interactive', contentText: null, interactivePayload: body.interactive_payload as Prisma.InputJsonValue } } as const
  }
  return { error: 'Tipo de mensagem inválido' } as const
}
