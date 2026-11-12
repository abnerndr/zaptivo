import { describe, expect, it } from 'vitest'
import {
  buildInboxStartResults,
  normalizeStartPhone,
} from './start-chat'

const conversation = (
  id: string,
  contact: { id: string; name: string | null; phone: string } | null,
  last = 'oi',
) => ({ id, last_message_text: last, contact })

describe('normalizeStartPhone', () => {
  it('prefixes 55 on a Brazilian local mobile', () => {
    expect(normalizeStartPhone('11999998888')).toBe('5511999998888')
  })

  it('prefixes 55 on a 10-digit local number', () => {
    expect(normalizeStartPhone('(11) 3333-4444')).toBe('551133334444')
  })

  it('keeps an already international Brazilian number', () => {
    expect(normalizeStartPhone('+55 11 99999-8888')).toBe('5511999998888')
  })

  it('rejects text and WhatsApp LIDs', () => {
    expect(normalizeStartPhone('maria')).toBeNull()
    expect(normalizeStartPhone('551199999999999')).toBeNull()
  })
})

describe('buildInboxStartResults', () => {
  const conversations = [
    conversation('c1', { id: 'ct1', name: 'Ana', phone: '5511999998888' }, 'bom dia'),
    conversation('c2', { id: 'ct2', name: 'Bia', phone: '5511888887777' }, 'até logo'),
  ]

  it('returns the conversations unchanged when the query is empty', () => {
    const result = buildInboxStartResults({
      query: '   ',
      conversations,
      contacts: [{ id: 'ct9', name: 'Zoe', phone: '5511777776666' }],
    })
    expect(result.conversations).toEqual(conversations)
    expect(result.contacts).toEqual([])
    expect(result.startPhone).toBeNull()
  })

  it('filters conversations by name, phone and last message', () => {
    expect(
      buildInboxStartResults({ query: 'bia', conversations, contacts: [] })
        .conversations.map((c) => c.id),
    ).toEqual(['c2'])
    expect(
      buildInboxStartResults({ query: '7777', conversations, contacts: [] })
        .conversations.map((c) => c.id),
    ).toEqual(['c2'])
    expect(
      buildInboxStartResults({ query: 'bom dia', conversations, contacts: [] })
        .conversations.map((c) => c.id),
    ).toEqual(['c1'])
  })

  it('hides a contact already shown in the filtered conversations', () => {
    const result = buildInboxStartResults({
      query: 'ana',
      conversations,
      contacts: [
        { id: 'ct1', name: 'Ana', phone: '5511999998888' },
        { id: 'ct3', name: 'Ana Paula', phone: '5511666665555' },
      ],
    })
    expect(result.contacts.map((c) => c.id)).toEqual(['ct3'])
  })

  it('keeps a contact found only by email when the local conversation did not match', () => {
    const result = buildInboxStartResults({
      query: 'financeiro',
      conversations,
      contacts: [{ id: 'ct1', name: 'Ana', phone: '5511999998888' }],
    })
    expect(result.conversations).toEqual([])
    expect(result.contacts.map((c) => c.id)).toEqual(['ct1'])
  })

  it('offers a new Brazilian number when nothing matches exactly', () => {
    const result = buildInboxStartResults({
      query: '11999990000',
      conversations,
      contacts: [],
    })
    expect(result.startPhone).toBe('5511999990000')
  })

  it('does not offer a new number already present on a loaded conversation or returned contact', () => {
    expect(
      buildInboxStartResults({
        query: '11999998888',
        conversations,
        contacts: [],
      }).startPhone,
    ).toBeNull()
    expect(
      buildInboxStartResults({
        query: '11777776666',
        conversations,
        contacts: [{ id: 'ct9', name: null, phone: '5511777776666' }],
      }).startPhone,
    ).toBeNull()
  })

  it('does not offer a start phone for ordinary text', () => {
    expect(
      buildInboxStartResults({ query: 'maria', conversations, contacts: [] })
        .startPhone,
    ).toBeNull()
  })
})
