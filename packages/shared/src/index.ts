export type ApiErrorBody = {
  error: string
  code?: string
}

export const AUTH_COOKIE_NAMES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
] as const
