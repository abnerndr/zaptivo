import { prisma } from '@/domain/db/prisma'
import type { PrismaClient } from '@prisma/client'
import { findActiveKeyByHash, touchLastUsed } from '@/domain/api-keys/store'
import { hashApiKey, looksLikeApiKey } from '@/domain/api-keys/keys'
import { hasScope, type ApiScope } from '@/domain/api-keys/scopes'
import { forbidden, rateLimited, unauthorized } from '@/domain/api/v1/respond'
import { checkRateLimit, RATE_LIMITS } from '@/domain/rate-limit'

export interface ApiKeyContext {
  authType: 'api_key'
  /** @deprecated use prisma */
  supabase: PrismaClient
  prisma: PrismaClient
  accountId: string
  keyId: string
  scopes: string[]
  createdBy: string | null
}

function extractKey(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const value = header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : header.trim()
  return value.length > 0 ? value : null
}

export async function requireApiKey(
  request: Request,
  scope?: ApiScope
): Promise<ApiKeyContext> {
  const presented = extractKey(request)
  if (!presented || !looksLikeApiKey(presented)) {
    throw unauthorized()
  }

  const row = await findActiveKeyByHash(hashApiKey(presented))
  if (!row) {
    throw unauthorized()
  }

  const limit = checkRateLimit(`apikey:${row.id}`, RATE_LIMITS.publicApi)
  if (!limit.success) {
    throw rateLimited(limit)
  }

  if (scope && !hasScope(row.scopes, scope)) {
    throw forbidden(`This API key is missing the '${scope}' scope`)
  }

  touchLastUsed(row.id)

  return {
    authType: 'api_key',
    supabase: prisma,
    prisma,
    accountId: row.account_id,
    keyId: row.id,
    scopes: row.scopes,
    createdBy: row.created_by,
  }
}
