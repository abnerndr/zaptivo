import { prisma } from '@/lib/db/prisma'
import { normalizeCpf, isValidCpf } from '@/lib/auth/cpf'
import { hashPassword } from '@/lib/auth/password'

export async function signupWithCpf(input: {
  cpf: string
  password: string
  name: string
  email?: string
}) {
  if (!isValidCpf(input.cpf)) {
    throw new Error('CPF inválido')
  }
  if (input.password.length < 8) {
    throw new Error('Senha muito curta')
  }

  const cpf = normalizeCpf(input.cpf)
  const passwordHash = await hashPassword(input.password)
  const email = input.email?.trim() || null
  const name = input.name.trim()
  if (!name) throw new Error('Nome obrigatório')

  const existing = await prisma.user.findUnique({ where: { cpf } })
  if (existing) throw new Error('CPF já cadastrado')

  if (email) {
    const emailTaken = await prisma.user.findUnique({ where: { email } })
    if (emailTaken) throw new Error('E-mail já cadastrado')
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        cpf,
        email,
        name,
        passwordHash,
      },
    })

    const tenant = await tx.tenant.create({
      data: {
        name: `${name}`,
        ownerUserId: user.id,
        defaultCurrency: 'BRL',
      },
    })

    await tx.profile.create({
      data: {
        userId: user.id,
        accountId: tenant.id,
        fullName: name,
        email: email ?? `${cpf}@local.invalid`,
        accountRole: 'owner',
      },
    })

    return { user, tenant }
  })
}
