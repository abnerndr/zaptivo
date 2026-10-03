export type WahaJidPayload = {
  from?: string
  to?: string
  fromMe?: boolean
  _data?: {
    key?: {
      remoteJid?: string
      remoteJidAlt?: string
      fromMe?: boolean
    }
    Info?: {
      Chat?: string
      RecipientAlt?: string
      SenderAlt?: string
    }
  } | null
}

function isGroupOrBroadcast(jid: string | undefined | null): boolean {
  if (!jid) return false
  return (
    jid.includes('@g.us') ||
    jid.includes('@newsletter') ||
    jid.includes('status@broadcast') ||
    jid.includes('@broadcast')
  )
}

/** Prefer real phone JID over @lid (NOWEB/GOWS). */
export function pickContactJid(payload: WahaJidPayload): string | null {
  const key = payload._data?.key
  const info = payload._data?.Info
  const candidates = [
    key?.remoteJidAlt,
    info?.RecipientAlt,
    info?.SenderAlt,
    payload.fromMe ? payload.to : payload.from,
    key?.remoteJid,
    info?.Chat,
    payload.fromMe ? payload.from : payload.to,
  ]
  for (const jid of candidates) {
    if (!jid || isGroupOrBroadcast(jid)) continue
    if (jid.includes('@lid')) continue
    return jid
  }
  for (const jid of candidates) {
    if (!jid || isGroupOrBroadcast(jid)) continue
    return jid
  }
  return null
}

/** Extract @lid from payload when present (for caching LID↔phone). */
export function pickLidJid(payload: WahaJidPayload): string | null {
  const key = payload._data?.key
  const info = payload._data?.Info
  const candidates = [
    key?.remoteJid,
    info?.Chat,
    payload.fromMe ? payload.to : payload.from,
    payload.fromMe ? payload.from : payload.to,
    key?.remoteJidAlt,
    info?.RecipientAlt,
    info?.SenderAlt,
  ]
  for (const jid of candidates) {
    if (!jid || isGroupOrBroadcast(jid)) continue
    if (jid.includes('@lid')) return jid
  }
  return null
}
