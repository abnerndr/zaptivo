/**
 * Seed do primeiro usuário (owner/admin da conta).
 *
 * Uso:
 *   SEED_ADMIN_CPF=52998224725 \
 *   SEED_ADMIN_PASSWORD='sua-senha-forte' \
 *   SEED_ADMIN_NAME='Admin' \
 *   SEED_ADMIN_EMAIL=admin@example.com \
 *   npx prisma db seed
 *
 * Ou: yarn db:seed
 *
 * Idempotente: se o CPF já existir, não cria de novo
 * (use SEED_ADMIN_RESET=1 para atualizar a senha).
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { normalizeCpf, isValidCpf } from '../src/domain/auth/cpf'
import { hashPassword } from '../src/domain/auth/password'
import { ensureSystemOrgRoles } from '../src/domain/auth/org-roles'

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback
  if (!value) {
    throw new Error(
      `Defina ${name} (ex.: no .env ou inline). Ver prisma/seed.ts`,
    )
  }
  return value
}

async function main() {
  const cpfRaw = requireEnv('SEED_ADMIN_CPF', '52998224725')
  const password = requireEnv('SEED_ADMIN_PASSWORD')
  const name = requireEnv('SEED_ADMIN_NAME', 'Admin')
  const emailRaw = process.env.SEED_ADMIN_EMAIL?.trim() || null
  const reset = process.env.SEED_ADMIN_RESET === '1'

  if (!isValidCpf(cpfRaw)) {
    throw new Error(`SEED_ADMIN_CPF inválido: ${cpfRaw}`)
  }
  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD deve ter pelo menos 8 caracteres')
  }

  const cpf = normalizeCpf(cpfRaw)
  const email = emailRaw

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL não definido')
  }

  const pool = new Pool({ connectionString })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

  try {
    const existing = await prisma.user.findUnique({
      where: { cpf },
      include: { profile: true },
    })

    if (existing) {
      if (reset) {
        const passwordHash = await hashPassword(password)
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            name,
            ...(email ? { email } : {}),
          },
        })
        if (existing.profile) {
          await prisma.profile.update({
            where: { userId: existing.id },
            data: {
              fullName: name,
              ...(email ? { email } : {}),
              accountRole: 'owner',
            },
          })
          await ensureSystemOrgRoles(existing.profile.accountId)
        }
        console.log(`Admin atualizado (reset senha): CPF ${cpf}`)
        return
      }

      if (existing.profile) {
        await ensureSystemOrgRoles(existing.profile.accountId)
      }
      console.log(
        `Admin já existe (CPF ${cpf}). Nada a fazer. SEED_ADMIN_RESET=1 para resetar senha.`,
      )
      return
    }

    if (email) {
      const emailTaken = await prisma.user.findUnique({ where: { email } })
      if (emailTaken) {
        throw new Error(`E-mail já cadastrado: ${email}`)
      }
    }

    const passwordHash = await hashPassword(password)

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
          name,
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

      return { userId: user.id, tenantId: tenant.id }
    })

    await ensureSystemOrgRoles(result.tenantId)

    console.log('Admin criado com role owner:')
    console.log(`  CPF:    ${cpf}`)
    console.log(`  Nome:   ${name}`)
    console.log(`  E-mail: ${email ?? '(nenhum)'}`)
    console.log(`  userId: ${result.userId}`)
    console.log(`  accountId: ${result.tenantId}`)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
