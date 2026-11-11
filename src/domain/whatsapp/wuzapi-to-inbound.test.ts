import { describe, expect, it } from 'vitest'
import { parseWuzapiWebhook } from './wuzapi-event'
import {
  wuzapiConnectionStatus,
  wuzapiMessageToPayload,
  wuzapiReceiptToAck,
} from './wuzapi-to-inbound'

describe('wuzapi-to-inbound', () => {
  it('maps a message event into the shared ingest payload', () => {
    const parsed = parseWuzapiWebhook({
      type: 'Message',
      event: {
        Info: {
          ID: 'msg-1',
          Chat: '5511999999999@s.whatsapp.net',
          Sender: '5511999999999@s.whatsapp.net',
          IsFromMe: false,
          PushName: 'Ana',
        },
        Message: { conversation: 'oi' },
      },
    })
    expect(parsed.type).toBe('message')
    if (parsed.type !== 'message') return
    expect(wuzapiMessageToPayload(parsed)).toMatchObject({
      id: 'msg-1',
      fromMe: false,
      body: 'oi',
      pushName: 'Ana',
      from: '5511999999999@s.whatsapp.net',
    })
  })

  it('provides WuzAPI download metadata for received media', () => {
    const parsed = parseWuzapiWebhook({
      type: 'Message', event: {
        Info: { ID: 'img-1', Chat: '5511@s.whatsapp.net' },
        Message: { imageMessage: { mimetype: 'image/jpeg', URL: 'https://media.example/file', mediaKey: 'key', fileSha256: 'hash', fileEncSha256: 'encrypted-hash', fileLength: 42, directPath: '/media' } },
      },
    })
    if (parsed.type !== 'message') throw new Error('expected message')
    expect(wuzapiMessageToPayload(parsed).media?.download).toEqual({
      kind: 'image', mimeType: 'image/jpeg', url: 'https://media.example/file', mediaKey: 'key', fileSha256: 'hash', fileEncSha256: 'encrypted-hash', fileLength: 42, directPath: '/media',
    })
  })

  it('maps receipts to ack payloads', () => {
    const parsed = parseWuzapiWebhook({
      type: 'ReadReceipt',
      state: 'Read',
      event: { MessageIDs: ['a', 'b'], Chat: '5511@s.whatsapp.net' },
    })
    expect(parsed.type).toBe('receipt')
    if (parsed.type !== 'receipt') return
    expect(wuzapiReceiptToAck(parsed)).toEqual([
      expect.objectContaining({ id: 'a', ack: 4 }),
      expect.objectContaining({ id: 'b', ack: 4 }),
    ])
  })

  it('maps connection statuses to config statuses', () => {
    expect(wuzapiConnectionStatus('connected')).toBe('WORKING')
    expect(wuzapiConnectionStatus('connecting')).toBe('STARTING')
    expect(wuzapiConnectionStatus('disconnected')).toBe('STOPPED')
  })
})
