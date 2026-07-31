import { authContext } from './auth-context'

export async function auth(): Promise<{
  user: {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
  }
} | null> {
  const store = authContext.getStore()
  if (!store?.userId) return null
  return {
    user: {
      id: store.userId,
      name: store.name ?? null,
      email: store.email ?? null,
      image: store.image ?? null,
    },
  }
}
