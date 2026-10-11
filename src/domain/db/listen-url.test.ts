import { describe, expect, it } from 'vitest'
import { listenConnectionString } from './listen-url'

const session = 'postgresql://u:p@db.example:5432/zaptivo'
const pooled = 'postgresql://u:p@db.example:6543/zaptivo?pgbouncer=true'

describe('listenConnectionString', () => {
  it('prefers DIRECT_DATABASE_URL', () => {
    expect(
      listenConnectionString({
        DIRECT_DATABASE_URL: session,
        DATABASE_URL: pooled,
      }),
    ).toBe(session)
  })

  it('uses DATABASE_URL when it is already a session url', () => {
    expect(listenConnectionString({ DATABASE_URL: session })).toBe(session)
  })

  it('rejects a transaction pooler', () => {
    expect(() => listenConnectionString({ DATABASE_URL: pooled })).toThrow(
      'LISTEN requires a session-mode Postgres URL. Set DIRECT_DATABASE_URL.',
    )
  })

  it('rejects a missing url', () => {
    expect(() => listenConnectionString({})).toThrow('DATABASE_URL is not set')
  })
})
