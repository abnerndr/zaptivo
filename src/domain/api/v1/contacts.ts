
export class ContactError extends Error { status = 400 }
export function serializeContact(c: Record<string, unknown>) { return c }
export async function findOrCreateContact(..._args: unknown[]) { return { id: "x", created: false } }
export async function getContact(accountId: string, id: string) { return null }
