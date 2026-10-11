import { describe, expect, it } from 'vitest'
import { brPhonePrefixes } from './format-phone'

describe('brPhonePrefixes', () => {
  it('slices a junk-suffix BR jid into 13 then 12 digits', () => {
    expect(brPhonePrefixes('551699635630251')).toEqual([
      '5516996356302',
      '551699635630',
    ])
  })

  it('returns only the 12-digit slice when that is all there is', () => {
    expect(brPhonePrefixes('551699635630')).toEqual(['551699635630'])
  })

  it('returns empty when the digits are not a BR phone prefix', () => {
    expect(brPhonePrefixes('37063949836')).toEqual([])
    expect(brPhonePrefixes('55123')).toEqual([])
    expect(brPhonePrefixes('')).toEqual([])
  })
})
