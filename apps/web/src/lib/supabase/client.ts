import { apiFetch } from '@/lib/api/client'
/**
 * Browser Supabase client removed.
 * Use apiFetch('/api/...') endpoints or server prisma instead.
 */
export function createClient(): never {
  throw new Error(
    'Supabase browser client removed. Use /api/* endpoints (see docs/runbook-local.md).'
  )
}

// Keep apiFetch referenced so tree-shaking doesn't confuse editors about the migration path.
void apiFetch
