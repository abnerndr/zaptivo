import { describe, expect, it } from 'vitest'
import { extensionForMime, inboundMediaKey } from './inbound-media'

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
