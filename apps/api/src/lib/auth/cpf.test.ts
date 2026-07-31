import { describe, expect, it } from 'vitest'
import { normalizeCpf, isValidCpf } from './cpf'

describe('cpf', () => {
  it('normalizes to digits only', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725')
  })

  it('accepts valid CPF', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
  })

  it('rejects invalid CPF', () => {
    expect(isValidCpf('111.111.111-11')).toBe(false)
  })
})
