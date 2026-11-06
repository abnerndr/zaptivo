import { isIP } from 'node:net'

/** Explicit overrides are complete URLs, including the legacy callback path. */
export function whatsappWebhookUrl(override: string | undefined, site: string | undefined): string | null {
  const explicit = override?.trim()
  const input = explicit || site?.trim()
  if (!input) {
    if (process.env.NODE_ENV === 'production') throw new Error('WhatsApp webhook URL is not configured')
    return null
  }
  let parsed: URL
  try { parsed = new URL(input) } catch { throw new Error('Invalid WhatsApp webhook URL') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Invalid WhatsApp webhook URL')
  }
  if (process.env.NODE_ENV === 'production') {
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    const ip = isIP(host)
    const parts = host.split('.').map(Number)
    const privateV4 = ip === 4 && (parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127))
    const privateV6 = ip === 6 && (host === '::' || host === '::1' || /^(fc|fd|fe[89ab])/i.test(host) || host.includes('::ffff:'))
    if (parsed.protocol !== 'https:' || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.') && !ip || privateV4 || privateV6) {
      throw new Error('WhatsApp webhook must use a public HTTPS URL in production')
    }
  }
  return explicit || `${parsed.origin}/webhook/whatsapp`
}
