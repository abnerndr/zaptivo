import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

/**
 * Bump when Prisma schema fields change so the Next.js/Turbopack
 * global singleton does not keep a stale generated client in memory.
 */
const PRISMA_SCHEMA_VERSION = 2

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
  pgPool?: Pool
  prismaSchemaVersion?: number
}

export function getPgPool(): Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }
  if (!globalForPrisma.pgPool) {
    globalForPrisma.pgPool = new Pool({ connectionString })
  }
  return globalForPrisma.pgPool
}

function createClient(): PrismaClient {
  const adapter = new PrismaPg(getPgPool())
  return new PrismaClient({ adapter })
}

function getClient(): PrismaClient {
  if (
    globalForPrisma.prisma &&
    globalForPrisma.prismaSchemaVersion === PRISMA_SCHEMA_VERSION
  ) {
    return globalForPrisma.prisma
  }

  if (globalForPrisma.prisma) {
    void globalForPrisma.prisma.$disconnect().catch(() => {})
  }

  const client = createClient()
  globalForPrisma.prisma = client
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION
  return client
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient()
    const value = Reflect.get(client as object, prop, receiver)
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value
  },
})
