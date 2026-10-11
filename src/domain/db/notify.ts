import { getPgPool } from '@/domain/db/prisma'
import type { NotifiablePayload } from '@/domain/realtime/payload'

export type { RealtimePayload } from '@/domain/realtime/payload'

export function accountNotifyChannel(accountId: string): string {
  return `account_${accountId.replace(/-/g, '_')}`
}

/**
 * Fan-out via Postgres LISTEN/NOTIFY.
 * Uses the shared `pg` Pool directly — Prisma $executeRaw can be flaky
 * with NOTIFY under the driver adapter.
 */
export async function notifyAccount(payload: NotifiablePayload): Promise<void> {
  const channel = accountNotifyChannel(payload.accountId)
  const body = JSON.stringify(payload)
  try {
    await getPgPool().query(`SELECT pg_notify($1::text, $2::text)`, [
      channel,
      body,
    ])
  } catch (err) {
    console.warn('[notifyAccount]', err)
  }
}
