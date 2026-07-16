import { prisma } from '@/lib/db/prisma'

export function dbAdmin() {
  return prisma
}

/** @deprecated Use dbAdmin() */
export function supabaseAdmin() {
  return prisma
}
