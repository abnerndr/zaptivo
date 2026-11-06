import { describe, expect, it, vi } from 'vitest'
import { parseWuzapiWebhook } from './wuzapi-event'
import { mergeDeliveryStatus } from './transport'

describe('WuzAPI events', () => {
  it('preserves LIDs, quote and media metadata from a message', () => {
    const parsed = parseWuzapiWebhook({ type: 'Message', event: { Info: { ID: 'msg', Chat: '123@lid', Sender: '123@lid', SenderAlt: '5511@s.whatsapp.net', IsFromMe: false }, Message: { imageMessage: { mimetype: 'image/jpeg', URL: 'https://media', mediaKey: 'key', caption: 'photo', contextInfo: { stanzaId: 'quoted', participant: '123@lid' } } } } })
    expect(parsed).toMatchObject({ type: 'message', id: 'msg', chat: '123@lid', senderPn: '5511@s.whatsapp.net', text: 'photo', quote: { messageId: 'quoted', participant: '123@lid' }, media: { kind: 'image', metadata: { mediaKey: 'key' } } })
  })
  it('recognizes outgoing echoes and handles receipt ordering', () => {
    expect(parseWuzapiWebhook({ type: 'Message', event: { Info: { ID: 'id', Chat: '123@lid', IsFromMe: true }, Message: { conversation: 'hi' } } })).toMatchObject({ type: 'send-echo', text: 'hi' })
    expect(parseWuzapiWebhook({ type: 'ReadReceipt', state: 'Read', event: { MessageIDs: ['id', 'id2'], Chat: '123@lid' } })).toMatchObject({ type: 'receipt', messageIds: ['id', 'id2'], status: 'read' })
    expect(mergeDeliveryStatus('read', 'delivered')).toBe('read')
  })
  it('normalizes connection and QR and logs only unknown event names', () => {
    expect(parseWuzapiWebhook({ type: 'Connected' })).toEqual({ type: 'connection', status: 'connected' })
    expect(parseWuzapiWebhook({ type: 'QR', event: 'code', qrCodeBase64: 'data:image/png;base64,abc' })).toEqual({ type: 'qr', qr: 'data:image/png;base64,abc' })
    const log = vi.fn()
    expect(parseWuzapiWebhook({ type: 'Unknown', token: 'secret' }, log)).toEqual({ type: 'ignored', event: 'Unknown' })
    expect(log).toHaveBeenCalledWith('Unknown')
  })
})
