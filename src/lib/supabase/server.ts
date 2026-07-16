import { prisma } from '@/lib/db/prisma'
import { auth } from '@/auth'

/**
 * Server helper replacing Supabase SSR client.
 * Prefer `prisma` + `auth()` directly in new code.
 */
export async function createClient() {
  const session = await auth()
  return {
    auth: {
      getUser: async () => ({
        data: { user: session?.user ? { id: session.user.id } : null },
        error: null,
      }),
      getSession: async () => ({
        data: { session: session ? { user: session.user } : null },
        error: null,
      }),
    },
    /** @deprecated Use prisma directly */
    from: (_table: string) => {
      throw new Error(
        `supabase.from('${_table}') removed on server — use prisma`
      )
    },
    prisma,
  }
}
