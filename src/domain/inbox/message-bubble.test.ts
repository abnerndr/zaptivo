import { describe, expect, it } from 'vitest'
import { messageBubble } from './message-bubble'

describe('messageBubble', () => {
  it('renders text without a url', () => {
    expect(
      messageBubble({
        content_type: 'text',
        content_text: 'oi',
        media_url: null,
      }),
    ).toEqual({ kind: 'text', text: 'oi', url: null })
  })

  it('renders an image from its public url', () => {
    expect(
      messageBubble({
        content_type: 'image',
        content_text: 'foto',
        media_url: 'https://cdn.example/a.jpg',
      }),
    ).toEqual({
      kind: 'image',
      text: 'foto',
      url: 'https://cdn.example/a.jpg',
    })
  })

  it('keeps audio, video and document distinct', () => {
    expect(
      messageBubble({
        content_type: 'audio',
        content_text: null,
        media_url: 'https://cdn.example/a.ogg',
      }).kind,
    ).toBe('audio')
    expect(
      messageBubble({
        content_type: 'video',
        content_text: null,
        media_url: 'https://cdn.example/a.mp4',
      }).kind,
    ).toBe('video')
    expect(
      messageBubble({
        content_type: 'document',
        content_text: 'boleto.pdf',
        media_url: 'https://cdn.example/a.pdf',
      }).kind,
    ).toBe('document')
  })

  it('falls back to text when a media row has no url yet', () => {
    expect(
      messageBubble({
        content_type: 'image',
        content_text: '[image]',
        media_url: null,
      }),
    ).toEqual({ kind: 'text', text: '[image]', url: null })
  })
})
