import { prisma } from '@/lib/db/prisma'

export type RealtimePayload = {
  table: string
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  id: string
  accountId: string
}

export function accountNotifyChannel(accountId: string): string {
  return `account_${accountId.replace(/-/g, '_')}`
}

export async function notifyAccount(payload: RealtimePayload): Promise<void> {
  const channel = accountNotifyChannel(payload.accountId)
  await prisma.$executeRawUnsafe(
    `SELECT pg_notify($1, $2)`,
    channel,
    JSON.stringify(payload)
  )
}
