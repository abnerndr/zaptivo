export const MAX_DISPATCH_RECIPIENTS = 50

export function selectContactIds(args: {
  contacts: Array<{ id: string; typeId: string | null }>
  selectedIds: string[]
  typeId: string | null
}): string[] {
  const { contacts, selectedIds, typeId } = args
  const byId = new Map(contacts.map((c) => [c.id, c]))

  return selectedIds.filter((id) => {
    const contact = byId.get(id)
    if (!contact) return false
    if (typeId !== null && contact.typeId !== typeId) return false
    return true
  })
}

export function dispatchTiming(
  runAt: string | null,
  now: Date,
): { status: 'queued' | 'scheduled'; runAt: Date } {
  if (runAt === null || runAt === '') {
    return { status: 'queued', runAt: now }
  }

  const parsed = new Date(runAt)
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= now.getTime()) {
    return { status: 'queued', runAt: now }
  }

  return { status: 'scheduled', runAt: parsed }
}
