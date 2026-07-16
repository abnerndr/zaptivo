import { NextResponse } from 'next/server'
import { signupWithCpf } from '@/lib/auth/bootstrap'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      cpf?: string
      password?: string
      name?: string
      email?: string
    }
    if (!body.cpf || !body.password || !body.name) {
      return NextResponse.json(
        { error: 'cpf, password e name são obrigatórios' },
        { status: 400 }
      )
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
      message.includes('já cadastrado') || message.includes('inválido') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
