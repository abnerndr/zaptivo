import { AsyncLocalStorage } from 'node:async_hooks'

export type AuthStore = {
  userId: string
  name?: string | null
  email?: string | null
  image?: string | null
}

export const authContext = new AsyncLocalStorage<AuthStore>()
