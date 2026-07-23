import { describe, expect, it } from 'vitest'
import {
  pickContactJid,
  pickLidJid,
  type WahaJidPayload,
} from '@/lib/whatsapp/inbound-jid'

describe('pickContactJid / pickLidJid', () => {
  it('prefers phone JID over LID for contact', () => {
    const payload: WahaJidPayload = {
      from: '99999999999999@lid',
      _data: {
        key: {
          remoteJid: '99999999999999@lid',
          remoteJidAlt: '5516996356302@c.us',
        },
      },
    }
    expect(pickContactJid(payload)).toBe('5516996356302@c.us')
    expect(pickLidJid(payload)).toBe('99999999999999@lid')
  })

  it('falls back to LID when no phone alt is present', () => {
    const payload: WahaJidPayload = {
      from: '99999999999999@lid',
      _data: {
        key: { remoteJid: '99999999999999@lid' },
      },
    }
    expect(pickContactJid(payload)).toBe('99999999999999@lid')
    expect(pickLidJid(payload)).toBe('99999999999999@lid')
  })
})
