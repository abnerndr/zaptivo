import { NextResponse } from 'next/server'
import { requireSessionAccount } from '@/domain/auth/context'
import { getOrgRolePermissions } from '@/domain/auth/org-roles'
import { canSendMessages } from '@/domain/auth/roles'
import { prisma } from '@/domain/db/prisma'
import { parseQuickReply, serializeQuickReply } from '@/domain/inbox/quick-replies'

export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const rows = await prisma.quickReply.findMany({ where: { accountId: ctx.accountId }, orderBy: { updatedAt: 'desc' } })
    return NextResponse.json({ quick_replies: rows.map(serializeQuickReply) })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Erro ao carregar modelos' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const permissions = await getOrgRolePermissions(ctx.profile.orgRoleId)
    if (ctx.role === 'viewer' || !canSendMessages({ accountRole: ctx.role, permissions })) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    const parsed = parseQuickReply(await req.json().catch(() => null))
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const row = await prisma.quickReply.create({ data: { ...parsed.data, accountId: ctx.accountId, userId: ctx.userId } })
    return NextResponse.json({ quick_reply: serializeQuickReply(row) }, { status: 201 })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Erro ao salvar modelo' }, { status: 500 })
  }
}
