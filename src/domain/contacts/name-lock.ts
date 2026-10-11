type Named = { name: string | null; nameLocked: boolean }

function trimmed(name: string | null): string | null {
  const value = name?.trim()
  return value ? value : null
}

/**
 * User-typed names survive a merge. Push name only fills a blank unlocked contact.
 * When both sides are locked, the contact being absorbed wins — that is the
 * record the user just edited.
 */
export function preferLockedName(args: {
  current: Named
  survivor: Named
  pushName: string | null
}): { name: string | null; nameLocked: boolean } {
  const currentName = trimmed(args.current.name)
  if (args.current.nameLocked && currentName) {
    return { name: currentName, nameLocked: true }
  }
  const survivorName = trimmed(args.survivor.name)
  if (args.survivor.nameLocked && survivorName) {
    return { name: survivorName, nameLocked: true }
  }
  if (survivorName) {
    return { name: survivorName, nameLocked: false }
  }
  const fallback = trimmed(args.pushName) ?? currentName
  return { name: fallback, nameLocked: false }
}
