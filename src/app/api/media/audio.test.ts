import { describe, expect, it } from 'vitest'
import { MAX_AUDIO_BYTES, validateAudio } from './audio'

function page(payload: Buffer, sequence: number, flags: number, granule: bigint): Buffer {
  const header = Buffer.alloc(28)
  header.write('OggS')
  header[5] = flags
  header.writeBigUInt64LE(granule, 6)
  header.writeUInt32LE(123, 14)
  header.writeUInt32LE(sequence, 18)
  header[26] = 1
  header[27] = payload.length
  return Buffer.concat([header, payload])
}

function audio(seconds: number): Buffer {
  const head = Buffer.alloc(19)
  head.write('OpusHead')
  head[8] = 1
  head[9] = 1
  head.writeUInt16LE(312, 10)
  return Buffer.concat([page(head, 0, 2, 0n), page(Buffer.from([1]), 1, 4, BigInt(seconds * 48000 + 312))])
}

describe('audio validation', () => {
  it('accepts short and 60 second Ogg Opus clips', () => {
    expect(validateAudio(audio(1), 'audio/ogg; codecs=opus')).toBe(1)
    expect(validateAudio(audio(60), 'audio/ogg')).toBe(60)
  })
  it('rejects incompatible MIME, invalid containers, excessive size and duration', () => {
    expect(() => validateAudio(audio(1), 'audio/webm')).toThrow('Unsupported')
    expect(() => validateAudio(Buffer.from('not audio'), 'audio/ogg')).toThrow()
    expect(() => validateAudio(Buffer.alloc(MAX_AUDIO_BYTES + 1), 'audio/ogg')).toThrow('size')
    expect(() => validateAudio(audio(301), 'audio/ogg')).toThrow('long')
  })
})
