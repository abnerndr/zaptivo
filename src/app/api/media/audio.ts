// This route accepts the Ogg/Opus format produced by the current recorder.
// Duration comes from the container, never from a client-supplied value.
export const MAX_AUDIO_BYTES = 16 * 1024 * 1024
export const MAX_AUDIO_SECONDS = 300

export function validateAudio(bytes: Buffer, mime: string): number {
  if (mime.split(';', 1)[0].trim().toLowerCase() !== 'audio/ogg') throw new Error('Unsupported audio format')
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw new Error('Invalid audio size')
  let offset = 0
  let serial: number | undefined
  let sequence = 0
  let preSkip: number | undefined
  let finalGranule: bigint | undefined
  let ended = false
  while (offset < bytes.length) {
    if (offset + 27 > bytes.length || bytes.toString('ascii', offset, offset + 4) !== 'OggS' || bytes[offset + 4] !== 0) throw new Error('Invalid Ogg container')
    const flags = bytes[offset + 5]
    const pageSerial = bytes.readUInt32LE(offset + 14)
    const pageSequence = bytes.readUInt32LE(offset + 18)
    const count = bytes[offset + 26]
    if (offset + 27 + count > bytes.length || ended || pageSequence !== sequence++) throw new Error('Invalid Ogg pages')
    if (serial === undefined) {
      if (!(flags & 2) || (flags & 1)) throw new Error('Invalid Ogg stream')
      serial = pageSerial
    } else if (serial !== pageSerial || (flags & 2)) throw new Error('Multiple streams are not supported')
    let length = 0
    for (let i = 0; i < count; i++) length += bytes[offset + 27 + i]
    const start = offset + 27 + count
    const end = start + length
    if (end > bytes.length) throw new Error('Invalid Ogg page length')
    if (preSkip === undefined) {
      if (count < 1 || bytes[offset + 27] < 19 || bytes.toString('ascii', start, start + 8) !== 'OpusHead' || bytes[start + 8] !== 1 || ![1, 2].includes(bytes[start + 9])) throw new Error('Unsupported audio codec')
      preSkip = bytes.readUInt16LE(start + 10)
    }
    if (flags & 4) {
      ended = true
      finalGranule = bytes.readBigUInt64LE(offset + 6)
    }
    offset = end
  }
  if (!ended || finalGranule === undefined || preSkip === undefined || finalGranule <= BigInt(preSkip)) throw new Error('Invalid audio duration')
  const duration = Number(finalGranule - BigInt(preSkip)) / 48000
  if (!Number.isFinite(duration) || duration > MAX_AUDIO_SECONDS) throw new Error('Audio is too long')
  return duration
}
