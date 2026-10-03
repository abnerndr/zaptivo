import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('password', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('senha-forte')
    expect(await verifyPassword('senha-forte', hash)).toBe(true)
    expect(await verifyPassword('outra', hash)).toBe(false)
  })
})
