import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { hashInviteToken } from '@/domain/auth/invitations'

type Ctx = { params: Promise<{ token: string }> }

/**
 * Public peek — no auth required. Returns org name, role, email mask,
 * expiry and validity so the join page can render before login/signup.
 */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params
    if (!token || token.length < 16) {
      return NextResponse.json({ valid: false, error: 'Token inválido' }, { status: 400 })
    }

    const tokenHash = hashInviteToken(token)
    const invite = await prisma.accountInvitation.findUnique({
      where: { tokenHash },
      include: {
        account: { select: { name: true } },
        orgRole: { select: { name: true, systemKey: true } },
      },
    })

    if (!invite) {
      return NextResponse.json({ valid: false, error: 'Convite não encontrado' })
    }

    const expired = invite.expiresAt <= new Date()
    const accepted = !!invite.acceptedAt
    const valid = !expired && !accepted

    return NextResponse.json({
      valid,
      orgName: invite.account.name,
      role: invite.role,
      roleLabel: invite.orgRole?.name ?? invite.role,
      email: invite.email,
      expiresAt: invite.expiresAt.toISOString(),
      expired,
      accepted,
    })
  } catch (err) {
    console.error('[invite peek]', err)
    return NextResponse.json({ valid: false, error: 'Erro interno' }, { status: 500 })
  }
}
