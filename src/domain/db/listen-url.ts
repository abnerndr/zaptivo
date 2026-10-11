const POOLER = /pgbouncer=true|:6543(\/|\?|$)/i

export function listenConnectionString(env: {
  DIRECT_DATABASE_URL?: string
  DATABASE_URL?: string
}): string {
  const url = env.DIRECT_DATABASE_URL || env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  if (POOLER.test(url)) {
    throw new Error(
      'LISTEN requires a session-mode Postgres URL. Set DIRECT_DATABASE_URL.',
    )
  }
  return url
}
