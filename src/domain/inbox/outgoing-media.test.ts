import { describe, expect, it } from 'vitest'
import { outgoingMediaKind } from './outgoing-media'

describe('outgoingMediaKind', () => {
  it('maps mime groups to message types', () => {
    expect(outgoingMediaKind({ type: 'image/jpeg', size: 1000 })).toEqual({
      messageType: 'image',
    })
    expect(outgoingMediaKind({ type: 'audio/ogg', size: 1000 })).toEqual({
      messageType: 'audio',
    })
    expect(outgoingMediaKind({ type: 'video/mp4', size: 1000 })).toEqual({
      messageType: 'video',
    })
    expect(outgoingMediaKind({ type: 'application/pdf', size: 1000 })).toEqual({
      messageType: 'document',
    })
  })

  it('rejects an oversized image and an empty mime', () => {
    expect(
      outgoingMediaKind({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }),
    ).toEqual({ error: 'Arquivo grande demais' })
    expect(outgoingMediaKind({ type: '', size: 10 })).toEqual({
      error: 'Tipo de arquivo desconhecido',
    })
  })
})
