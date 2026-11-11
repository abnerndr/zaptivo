/**
 * Auth.js trata AUTH_URL como origem canônica e reescreve o request
 * (reqWithEnvURL) antes do redirect do proxy. Fora de produção, uma
 * AUTH_URL pública manda o browser para esse host — por exemplo
 * https://zapp.juspilot.com — mesmo com o app aberto em localhost.
 */

type Env = {
  NODE_ENV?: string
  AUTH_URL?: string
  NEXTAUTH_URL?: string
  AUTH_COOKIE_DOMAIN?: string
}

type HeaderSource = {
  get(name: string): string | null
}

export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.localhost')
  )
}

export function isLocalUrl(value: string): boolean {
  try {
    return isLocalHost(new URL(value).hostname)
  } catch {
    return false
  }
}

/** Remove AUTH_URL e cookie domain públicos quando o processo não é produção. */
export function applyLocalAuthGuard(env: Env): void {
  if (env.NODE_ENV === 'production') return

  const configured = env.AUTH_URL ?? env.NEXTAUTH_URL
  if (configured && !isLocalUrl(configured)) {
    delete env.AUTH_URL
    delete env.NEXTAUTH_URL
  }

  const domain = env.AUTH_COOKIE_DOMAIN?.trim().replace(/^\./, '')
  if (domain && !isLocalHost(domain)) {
    delete env.AUTH_COOKIE_DOMAIN
  }
}

function originFromHost(raw: string | null | undefined, proto: string): string | null {
  const host = raw?.split(',')[0]?.trim()
  if (!host) return null
  try {
    const url = new URL(`${proto}://${host}`)
    if (!isLocalHost(url.hostname)) return null
    return url.origin
  } catch {
    return null
  }
}

/**
 * Base dos redirects de autenticação. Em produção segue a origem já
 * resolvida (AUTH_URL). Fora de produção, se o Host da requisição for
 * local, o redirect permanece nesse host.
 */
export function localAuthRedirectBase(input: {
  nodeEnv: string | undefined
  nextOrigin: string
  headers: HeaderSource
}): string {
  if (input.nodeEnv === 'production') return input.nextOrigin

  const proto =
    input.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'http'
  return (
    originFromHost(input.headers.get('host'), proto) ??
    originFromHost(input.headers.get('x-forwarded-host'), proto) ??
    input.nextOrigin
  )
}
