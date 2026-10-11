import { describe, expect, it } from 'vitest'
import {
  extensionForMime,
  inboundMediaKey,
  safePublicContentType,
  shouldSendWahaKey,
} from './inbound-media'

describe('inbound media path', () => {
  it('maps common mimes to extensions', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg')
    expect(extensionForMime('image/png')).toBe('png')
    expect(extensionForMime('audio/ogg')).toBe('ogg')
    expect(extensionForMime('video/mp4')).toBe('mp4')
    expect(extensionForMime('application/pdf')).toBe('pdf')
    expect(extensionForMime(null)).toBe('bin')
    expect(extensionForMime('application/zip')).toBe('bin')
  })

  it('stores the file under the account and the message id', () => {
    expect(inboundMediaKey('acc-1', 'msg-1', 'image/jpeg')).toBe(
      'chat-media/account-acc-1/msg-1.jpg',
    )
  })
})

describe('shouldSendWahaKey', () => {
  const base = 'https://waha.example'

  it('sends the key to the same origin', () => {
    expect(shouldSendWahaKey('https://waha.example/api/files/1', base)).toBe(true)
  })

  it('does not send the key to another origin', () => {
    expect(shouldSendWahaKey('https://evil.example/api/files/1', base)).toBe(false)
  })

  it('does not send the key without a base url', () => {
    expect(shouldSendWahaKey('https://waha.example/api/files/1', undefined)).toBe(
      false,
    )
  })

  it('resolves relative paths against the base', () => {
    expect(shouldSendWahaKey('/api/files/1', base)).toBe(true)
  })

  it('rejects invalid urls', () => {
    expect(shouldSendWahaKey('http://', base)).toBe(false)
  })
})

describe('safePublicContentType', () => {
  it('keeps allowed types', () => {
    expect(safePublicContentType('image/jpeg')).toBe('image/jpeg')
    expect(safePublicContentType('audio/ogg; codecs=opus')).toBe('audio/ogg')
  })

  it('turns anything else into octet-stream', () => {
    expect(safePublicContentType('text/html')).toBe('application/octet-stream')
    expect(safePublicContentType(null)).toBe('application/octet-stream')
  })
})
