import { describe, expect, it } from 'vitest'
import { preferLockedName } from './name-lock'

describe('preferLockedName', () => {
  it('keeps the name the user typed on the stub being merged', () => {
    expect(
      preferLockedName({
        current: { name: 'Maria da loja', nameLocked: true },
        survivor: { name: 'Maria', nameLocked: false },
        pushName: 'Maria',
      }),
    ).toEqual({ name: 'Maria da loja', nameLocked: true })
  })

  it('keeps a locked name already on the surviving contact', () => {
    expect(
      preferLockedName({
        current: { name: 'Maria', nameLocked: false },
        survivor: { name: 'Maria CRM', nameLocked: true },
        pushName: 'Maria',
      }),
    ).toEqual({ name: 'Maria CRM', nameLocked: true })
  })

  it('prefers the stub when both names are locked', () => {
    expect(
      preferLockedName({
        current: { name: 'Nome novo', nameLocked: true },
        survivor: { name: 'Nome antigo', nameLocked: true },
        pushName: 'Push',
      }),
    ).toEqual({ name: 'Nome novo', nameLocked: true })
  })

  it('fills an empty survivor from push name without locking', () => {
    expect(
      preferLockedName({
        current: { name: null, nameLocked: false },
        survivor: { name: null, nameLocked: false },
        pushName: 'Push',
      }),
    ).toEqual({ name: 'Push', nameLocked: false })
  })

  it('does not replace an unlocked survivor name with push name', () => {
    expect(
      preferLockedName({
        current: { name: null, nameLocked: false },
        survivor: { name: 'Já tinha', nameLocked: false },
        pushName: 'Push',
      }),
    ).toEqual({ name: 'Já tinha', nameLocked: false })
  })
})
