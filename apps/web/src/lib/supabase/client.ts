/**
 * Browser Supabase client removed.
 * Use fetch('/api/...') endpoints or server prisma instead.
 */
export function createClient(): never {
  throw new Error(
    'Supabase browser client removed. Use /api/* endpoints (see docs/runbook-local.md).'
  )
}
