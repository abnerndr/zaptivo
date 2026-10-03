import { prisma } from '@/domain/db/prisma'

export interface ApiKeyRow {
  id: string
  account_id: string
  created_by: string | null
  name: string
  scopes: string[]
  expires_at: string | null
  revoked_at: string | null
}

export async function findActiveKeyByHash(
  hash: string
): Promise<ApiKeyRow | null> {
  const data = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
  })
  if (!data) return null
  if (data.revokedAt) return null
  if (data.expiresAt && data.expiresAt.getTime() <= Date.now()) return null

  return {
    id: data.id,
    account_id: data.accountId,
    created_by: data.createdBy,
    name: data.name,
    scopes: data.scopes,
    expires_at: data.expiresAt ? new Date(data.expiresAt as Date).toISOString() : null,
    revoked_at: data.revokedAt ? new Date(data.revokedAt as Date).toISOString() : null,
  }
}

export async function getAccountName(
  accountId: string
): Promise<string | null> {
  const data = await prisma.tenant.findUnique({
    where: { id: accountId },
    select: { name: true },
  })
  return data?.name ?? null
}

export function touchLastUsed(id: string): void {
  void prisma.apiKey
    .update({
      where: { id },
      data: { lastUsedAt: new Date() },
    })
    .catch((err: unknown) => {
      console.warn(
        '[api-keys/store] last_used_at bump failed:',
        err instanceof Error ? err.message : err
      )
    })
}
