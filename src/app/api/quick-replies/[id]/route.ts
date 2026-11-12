import { NextResponse } from 'next/server'
import { requireSessionAccount } from '@/domain/auth/context'
import { getOrgRolePermissions } from '@/domain/auth/org-roles'
import { canSendMessages } from '@/domain/auth/roles'
import { prisma } from '@/domain/db/prisma'
import { parseQuickReply } from '@/domain/inbox/quick-replies'

type Context = { params: Promise<{ id: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function authorize() {
  const ctx = await requireSessionAccount()
  const permissions = await getOrgRolePermissions(ctx.profile.orgRoleId)
  if (ctx.role === 'viewer' || !canSendMessages({ accountRole: ctx.role, permissions })) throw new Response('Forbidden', { status: 403 })
  return ctx
}

export async function PATCH(req: Request, { params }: Context) {
  try {
    const ctx = await authorize()
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 })
    const parsed = parseQuickReply(await req.json().catch(() => null))
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const result = await prisma.quickReply.updateMany({ where: { id, accountId: ctx.accountId }, data: parsed.data })
    if (!result.count) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Erro ao salvar modelo' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Context) {
  try {
    const ctx = await authorize()
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 })
    const result = await prisma.quickReply.deleteMany({ where: { id, accountId: ctx.accountId } })
    if (!result.count) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Erro ao excluir modelo' }, { status: 500 })
  }
}
