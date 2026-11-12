import { isLikelyPhoneNumber } from '@/domain/whatsapp/format-phone'

export const inboxMessageVariables = [
  { key: 'name', label: 'Nome' },
  { key: 'first_name', label: 'Primeiro nome' },
  { key: 'phone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
  { key: 'company', label: 'Empresa' },
] as const

type Contact = {
  name?: string | null
  phone?: string | null
  email?: string | null
  company?: string | null
} | null

export function renderInboxMessage(text: string, contact: Contact) {
  const name = contact?.name?.trim() ?? ''
  const values: Record<string, string> = {
    name,
    first_name: name.split(/\s+/)[0] ?? '',
    phone: isLikelyPhoneNumber(contact?.phone) ? contact!.phone!.trim() : '',
    email: contact?.email?.trim() ?? '',
    company: contact?.company?.trim() ?? '',
  }
  const missing = new Set<string>()
  const unknown = new Set<string>()
  let hasVariables = false
  const rendered = text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (token, raw: string) => {
    hasVariables = true
    const key = raw.trim()
    if (!Object.hasOwn(values, key)) {
      unknown.add(key)
      return token
    }
    if (!values[key]) {
      missing.add(key)
      return token
    }
    return values[key]
  })
  return { text: rendered, hasVariables, missing: [...missing], unknown: [...unknown] }
}
