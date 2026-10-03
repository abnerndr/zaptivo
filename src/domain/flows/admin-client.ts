import { prisma } from '@/domain/db/prisma'

/** Shared DB access (replaces former Supabase service-role clients). */
export function dbAdmin() {
  return prisma
}

/** @deprecated Use dbAdmin() */
export function supabaseAdmin() {
  return prisma
}
