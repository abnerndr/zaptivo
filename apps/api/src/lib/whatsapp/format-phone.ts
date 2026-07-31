/**
 * Display helpers for WhatsApp phone numbers stored as digits-only.
 */

export function digitsOnly(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/\D/g, '')
}

/**
 * True when the value looks like a real phone number (not a WAHA/WhatsApp LID).
 */
export function isLikelyPhoneNumber(raw: string | null | undefined): boolean {
  const d = digitsOnly(raw)
  if (d.length < 10 || d.length > 15) return false
  // Brazil E.164 mobile/landline: 55 + DDD + local (10–13 digits total)
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) return true
  return !isLikelyLid(d)
}

/**
 * WhatsApp Linked IDs (LID) are opaque and often 14–15+ digits.
 * Real E.164 phones used here are typically 10–13 digits (e.g. BR 55…).
 */
export function isLikelyLid(raw: string | null | undefined): boolean {
  const d = digitsOnly(raw)
  if (!d) return false
  // Never treat normal Brazil numbers as LID
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) return false
  if (d.length >= 14) return true
  // 13 digits that are NOT Brazil international → treat as LID-ish
  if (d.length === 13 && !d.startsWith('55')) return true
  return false
}

/**
 * Format for UI. Brazilian numbers get a friendly layout; others get +E.164.
 * LIDs are labeled so they are not mistaken for phone numbers.
 */
export function formatWhatsAppPhone(raw: string | null | undefined): string {
  const digits = digitsOnly(raw)
  if (!digits) return '—'

  if (isLikelyLid(digits)) {
    return `ID WhatsApp · ${digits.slice(0, 6)}…`
  }

  // Brazil: 55 + DDD(2) + local(8–9)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4)
    const local = digits.slice(4)
    if (local.length === 9) {
      return `+55 (${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`
    }
    if (local.length === 8) {
      return `+55 (${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`
    }
  }

  return `+${digits}`
}

/** Title line for inbox rows: prefer name, else formatted phone. */
export function contactDisplayName(contact: {
  name?: string | null
  phone?: string | null
} | null): string {
  const name = contact?.name?.trim()
  if (name) return name
  return formatWhatsAppPhone(contact?.phone)
}
