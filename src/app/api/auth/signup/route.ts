import { NextResponse } from 'next/server'
import { signupWithCpf, signupWithInvite } from '@/lib/auth/bootstrap'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      cpf?: string
      password?: string
      name?: string
      email?: string
      inviteToken?: string
    }
    if (!body.cpf || !body.password || !body.name) {
      return NextResponse.json(
        { error: 'cpf, password e name são obrigatórios' },
        { status: 400 },
      )
    }

    if (body.inviteToken) {
      if (!body.email?.trim()) {
        return NextResponse.json(
          { error: 'E-mail é obrigatório para aceitar um convite' },
          { status: 400 },
        )
      }
      const result = await signupWithInvite({
        inviteToken: body.inviteToken,
        cpf: body.cpf,
        password: body.password,
        name: body.name,
        email: body.email,
      })
      return NextResponse.json({
        userId: result.user.id,
        accountId: result.accountId,
        joinedViaInvite: true,
      })
    }

    const result = await signupWithCpf({
      cpf: body.cpf,
      password: body.password,
      name: body.name,
      email: body.email,
    })
    return NextResponse.json({
      userId: result.user.id,
      accountId: result.tenant.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro no cadastro'
    const status =
      message.includes('já cadastrado') ||
      message.includes('inválido') ||
      message.includes('obrigatório') ||
      message.includes('expirado') ||
      message.includes('curta') ||
      message.includes('e-mail')
        ? 400
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}
