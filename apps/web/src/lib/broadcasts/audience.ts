import { prisma } from '@/lib/db/prisma'

export type AudienceFilter = {
  mode: 'all' | 'tags'
  tagIds: string[]
}

export function parseAudienceFilter(raw: unknown): AudienceFilter {
  if (!raw || typeof raw !== 'object') return { mode: 'all', tagIds: [] }
  const o = raw as Record<string, unknown>
  const tagIds = Array.isArray(o.tagIds)
    ? o.tagIds.filter((x): x is string => typeof x === 'string')
    : []
  if (o.mode === 'tags' && tagIds.length > 0) {
    return { mode: 'tags', tagIds }
  }
  return { mode: 'all', tagIds: [] }
}

export async function resolveAudienceContactIds(
  accountId: string,
  filter: AudienceFilter,
): Promise<string[]> {
  if (filter.mode === 'tags') {
    const rows = await prisma.contact.findMany({
      where: {
        accountId,
        contactTags: { some: { tagId: { in: filter.tagIds } } },
      },
      select: { id: true },
    })
    return rows.map((r) => r.id)
  }
  const rows = await prisma.contact.findMany({
    where: { accountId },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}
