/**
 * Normalize WAHA / WhatsApp message ids so the same message is recognized
 * across engines and event types (`message` vs `message.any`, @lid vs @c.us).
 *
 * Examples:
 *   false_5516999@c.us_3EB0ABC → 3EB0ABC
 *   true_123@lid_3EB0ABC       → 3EB0ABC
 *   3EB0ABC                    → 3EB0ABC
 */
export function normalizeWahaMessageId(
  id: string | null | undefined,
): string | null {
  if (!id) return null
  const s = String(id).trim()
  if (!s) return null

  // Prefer trailing token after the last underscore when the prefix looks
  // like WAHA's true_/false_PHONE@domain_ form.
  if (/^(true|false)_/i.test(s) && s.includes('_')) {
    const tail = s.slice(s.lastIndexOf('_') + 1)
    if (tail.length >= 6) return tail
  }

  return s
}

export function extractCanonicalMessageId(payload: {
  id?: string
  _data?: {
    key?: { id?: string }
    Info?: { ID?: string }
  } | null
}): string | null {
  const candidates = [
    payload._data?.key?.id,
    payload._data?.Info?.ID,
    payload.id,
  ]
  for (const c of candidates) {
    const n = normalizeWahaMessageId(c)
    if (n) return n
  }
  return null
}
