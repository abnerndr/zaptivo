import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { redeemInviteForUser } from '@/lib/auth/bootstrap'

type Ctx = { params: Promise<{ token: string }> }

/**
 * Redeem invite for the currently authenticated user.
 * Creates/moves Profile onto the invite's Tenant — never creates a Tenant.
 */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { token } = await ctx.params
    if (!token || token.length < 16) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
    }

    const result = await redeemInviteForUser({
      inviteToken: token,
      userId: session.user.id,
    })

    return NextResponse.json({
      ok: true,
      accountId: result.accountId,
      accountName: result.accountName,
      alreadyMember: result.alreadyMember,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao aceitar convite'
    const status =
      message.includes('inválido') ||
      message.includes('expirado') ||
      message.includes('outro e-mail') ||
      message.includes('proprietário')
        ? 400
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}
