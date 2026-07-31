import { prisma } from '@/lib/db/prisma'
import { normalizeCpf, isValidCpf } from '@/lib/auth/cpf'
import { hashPassword } from '@/lib/auth/password'
import { hashInviteToken } from '@/lib/auth/invitations'
import { ensureSystemOrgRoles } from '@/lib/auth/org-roles'
import type { AccountRole } from '@/lib/auth/roles'
import { isAccountRole } from '@/lib/auth/roles'

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

  const result = await prisma.$transaction(async (tx) => {
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

  await ensureSystemOrgRoles(result.tenant.id)
  return result
}

/**
 * Create a user and attach them to an existing org via invite token.
 * Does NOT create a new Tenant.
 */
export async function signupWithInvite(input: {
  inviteToken: string
  cpf: string
  password: string
  name: string
  email: string
}) {
  if (!isValidCpf(input.cpf)) {
    throw new Error('CPF inválido')
  }
  if (input.password.length < 8) {
    throw new Error('Senha muito curta')
  }
  const email = input.email.trim().toLowerCase()
  if (!email || !email.includes('@')) {
    throw new Error('E-mail obrigatório')
  }
  const name = input.name.trim()
  if (!name) throw new Error('Nome obrigatório')

  const tokenHash = hashInviteToken(input.inviteToken)
  const invite = await prisma.accountInvitation.findUnique({
    where: { tokenHash },
    include: { orgRole: true, account: true },
  })
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
    throw new Error('Convite inválido ou expirado')
  }

  const cpf = normalizeCpf(input.cpf)
  const existing = await prisma.user.findUnique({ where: { cpf } })
  if (existing) throw new Error('CPF já cadastrado')

  const emailTaken = await prisma.user.findUnique({ where: { email } })
  if (emailTaken) throw new Error('E-mail já cadastrado')

  if (invite.email && invite.email.toLowerCase() !== email) {
    throw new Error('Use o e-mail para o qual o convite foi enviado')
  }

  await ensureSystemOrgRoles(invite.accountId)

  const role: AccountRole =
    invite.orgRole?.systemKey && isAccountRole(invite.orgRole.systemKey)
      ? invite.orgRole.systemKey
      : invite.role

  if (role === 'owner') {
    throw new Error('Convite inválido')
  }

  let orgRoleId = invite.orgRoleId
  if (!orgRoleId) {
    const systemRole = await prisma.orgRole.findFirst({
      where: { accountId: invite.accountId, systemKey: role },
    })
    orgRoleId = systemRole?.id ?? null
  }

  const passwordHash = await hashPassword(input.password)

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        cpf,
        email,
        name,
        passwordHash,
      },
    })

    await tx.profile.create({
      data: {
        userId: user.id,
        accountId: invite.accountId,
        fullName: name,
        email,
        accountRole: role,
        orgRoleId,
      },
    })

    await tx.accountInvitation.update({
      where: { id: invite.id },
      data: {
        acceptedAt: new Date(),
        acceptedByUserId: user.id,
      },
    })

    return { user, accountId: invite.accountId, accountName: invite.account.name }
  })
}

/**
 * Attach an already-authenticated user to the invite's org.
 * Moves/creates profile on the invite tenant (one profile per user).
 */
export async function redeemInviteForUser(args: {
  inviteToken: string
  userId: string
}) {
  const tokenHash = hashInviteToken(args.inviteToken)
  const invite = await prisma.accountInvitation.findUnique({
    where: { tokenHash },
    include: { orgRole: true, account: true },
  })
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
    throw new Error('Convite inválido ou expirado')
  }

  const user = await prisma.user.findUnique({ where: { id: args.userId } })
  if (!user) throw new Error('Usuário não encontrado')

  if (
    invite.email &&
    user.email &&
    invite.email.toLowerCase() !== user.email.toLowerCase()
  ) {
    throw new Error('Este convite foi enviado para outro e-mail')
  }

  await ensureSystemOrgRoles(invite.accountId)

  const role: AccountRole =
    invite.orgRole?.systemKey && isAccountRole(invite.orgRole.systemKey)
      ? invite.orgRole.systemKey
      : invite.role

  if (role === 'owner') {
    throw new Error('Convite inválido')
  }

  let orgRoleId = invite.orgRoleId
  if (!orgRoleId) {
    const systemRole = await prisma.orgRole.findFirst({
      where: { accountId: invite.accountId, systemKey: role },
    })
    orgRoleId = systemRole?.id ?? null
  }

  const existingProfile = await prisma.profile.findUnique({
    where: { userId: args.userId },
  })

  if (existingProfile?.accountId === invite.accountId) {
    await prisma.accountInvitation.update({
      where: { id: invite.id },
      data: {
        acceptedAt: new Date(),
        acceptedByUserId: args.userId,
      },
    })
    return {
      accountId: invite.accountId,
      accountName: invite.account.name,
      alreadyMember: true,
    }
  }

  // One profile per user: if they own another tenant, block
  if (existingProfile?.accountRole === 'owner') {
    const owned = await prisma.tenant.findFirst({
      where: { ownerUserId: args.userId },
    })
    if (owned && owned.id !== invite.accountId) {
      throw new Error(
        'Você já é proprietário de outra organização. Peça para um admin transferir a propriedade antes de aceitar este convite.',
      )
    }
  }

  await prisma.$transaction(async (tx) => {
    if (existingProfile) {
      // Soft-move: update profile to invite account
      if (existingProfile.accountId !== invite.accountId) {
        // If they were sole owner of previous empty? We still block owners above.
        await tx.profile.update({
          where: { userId: args.userId },
          data: {
            accountId: invite.accountId,
            accountRole: role,
            orgRoleId,
            fullName: user.name ?? existingProfile.fullName,
            email:
              user.email ??
              invite.email ??
              existingProfile.email,
          },
        })
      }
    } else {
      await tx.profile.create({
        data: {
          userId: args.userId,
          accountId: invite.accountId,
          fullName: user.name ?? 'Membro',
          email: user.email ?? invite.email ?? `${user.cpf}@local.invalid`,
          accountRole: role,
          orgRoleId,
        },
      })
    }

    await tx.accountInvitation.update({
      where: { id: invite.id },
      data: {
        acceptedAt: new Date(),
        acceptedByUserId: args.userId,
      },
    })
  })

  return {
    accountId: invite.accountId,
    accountName: invite.account.name,
    alreadyMember: false,
  }
}
