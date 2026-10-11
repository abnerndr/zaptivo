import { describe, expect, it } from 'vitest'
import { parseContactTypeInput } from './contact-type'

describe('parseContactTypeInput', () => {
  it('trims the name and defaults the color', () => {
    expect(parseContactTypeInput({ name: '  Lead frio  ', color: '' })).toEqual({
      ok: true,
      name: 'Lead frio',
      color: '#64748b',
    })
  })

  it('accepts a hex color', () => {
    expect(parseContactTypeInput({ name: 'Cliente', color: '#112233' })).toEqual({
      ok: true,
      name: 'Cliente',
      color: '#112233',
    })
  })

  it('rejects an empty name, a long name and a bad color', () => {
    expect(parseContactTypeInput({ name: '   ', color: '#112233' })).toEqual({
      ok: false,
      error: 'Nome obrigatório',
    })
    expect(
      parseContactTypeInput({ name: 'a'.repeat(41), color: '#112233' }),
    ).toEqual({ ok: false, error: 'Nome longo demais' })
    expect(parseContactTypeInput({ name: 'Cliente', color: 'blue' })).toEqual({
      ok: false,
      error: 'Cor inválida',
    })
  })
})
