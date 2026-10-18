import { describe, expect, it } from 'vitest'
import { parseEvolutionWebhook } from './evolution-event'

const upsert = {
  event: 'messages.upsert',
  instance: 'loja',
  data: {
    key: {
      remoteJid: '5511996044236@s.whatsapp.net',
      fromMe: false,
      id: '3AA123',
    },
    pushName: 'Ana',
    message: { conversation: 'qual o preço?' },
    messageTimestamp: 1700000000,
  },
}

describe('parseEvolutionWebhook', () => {
  it('maps a customer text into the inbox payload', () => {
    const parsed = parseEvolutionWebhook(upsert)
    expect(parsed).toMatchObject({
      type: 'message',
      instance: 'loja',
      payload: {
        id: '3AA123',
        from: '5511996044236@s.whatsapp.net',
        fromMe: false,
        body: 'qual o preço?',
        pushName: 'Ana',
        hasMedia: false,
      },
    })
  })

  it('accepts the uppercase event name', () => {
    const parsed = parseEvolutionWebhook({ ...upsert, event: 'MESSAGES_UPSERT' })
    expect(parsed.type).toBe('message')
  })

  it('marks messages sent by the API so they do not take the thread over', () => {
    const parsed = parseEvolutionWebhook({
      event: 'SEND_MESSAGE',
      instance: 'loja',
      data: {
        key: { remoteJid: '5511999@s.whatsapp.net', fromMe: true, id: 'OUT1' },
        message: { conversation: 'oi' },
      },
    })
    expect(parsed).toMatchObject({
      type: 'message',
      payload: { fromMe: true, source: 'api', id: 'OUT1' },
    })
  })

  it('maps connection and read receipts', () => {
    expect(
      parseEvolutionWebhook({
        event: 'connection.update',
        instance: 'loja',
        data: { state: 'open' },
      }),
    ).toEqual({ type: 'connection', instance: 'loja', status: 'WORKING' })

    const ack = parseEvolutionWebhook({
      event: 'MESSAGES_UPDATE',
      instance: 'loja',
      data: { key: { id: '3AA123', fromMe: true }, status: 'READ' },
    })
    expect(ack).toMatchObject({ type: 'ack', payload: { id: '3AA123', ack: 4 } })
  })

  it('skips events without an instance', () => {
    expect(parseEvolutionWebhook({ event: 'messages.upsert', data: {} })).toEqual({
      type: 'skip',
      event: 'messages.upsert',
    })
  })
})
