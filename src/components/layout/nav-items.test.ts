import { describe, expect, it } from 'vitest'
import { mainNavHrefs } from './nav-items'

describe('mainNavHrefs', () => {
  it('keeps chat, contacts and automations and hides the rest of the old CRM', () => {
    expect(mainNavHrefs()).toEqual([
      '/dashboard',
      '/inbox',
      '/notifications',
      '/contacts',
      '/automations',
    ])
  })
})
