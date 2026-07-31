
export function normalizeKey(phone: string) { return phone.replace(/\D/g, "") }
export function dedupeByPhone<T extends { phone: string; name?: string }>(rows: T[]) {
  const seen = new Set<string>()
  const unique: T[] = []
  const duplicates: T[] = []
  for (const r of rows) {
    const k = normalizeKey(r.phone)
    if (seen.has(k)) duplicates.push(r)
    else { seen.add(k); unique.push(r) }
  }
  return { unique, duplicates }
}
export function isExactMatch(..._a: unknown[]) { return false }
export function isUniqueViolation(err: unknown) { return String(err).includes("unique") }
export async function findExistingContact(..._a: unknown[]) { return null as { id: string } | null }
