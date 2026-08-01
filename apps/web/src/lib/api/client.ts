import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'

declare global {
  interface Window {
    __WACRM_API_URL__?: string
  }
}

/**
 * Browser: same-origin ('' → `/api/...` via Next proxy) unless an
 * explicit public API URL is injected. Server: prefer internal Nest URL.
 */
function apiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return (
      process.env.API_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:4000'
    )
  }
  if (typeof window.__WACRM_API_URL__ === 'string') {
    return window.__WACRM_API_URL__
  }
  return process.env.NEXT_PUBLIC_API_URL || ''
}

export const api = axios.create({
  baseURL: apiBaseUrl(),
  withCredentials: true,
  headers: {
    Accept: 'application/json',
  },
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    config.baseURL = apiBaseUrl()
  }
  return config
})

/**
 * Drop-in replacement for `fetch('/api/...')` that talks to the Nest
 * backend via Axios while preserving a Fetch-like Response for existing
 * `.ok` / `.json()` call sites.
 */
export async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = new Headers(init?.headers)
  const body = init?.body

  // Multipart / binary: native fetch (Axios FormData edge cases)
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const url = input.startsWith('http')
      ? input
      : `${apiBaseUrl()}${input.startsWith('/') ? '' : '/'}${input}`
    return fetch(url, { ...init, credentials: 'include' })
  }

  let data: unknown = undefined
  if (body != null && method !== 'GET' && method !== 'HEAD') {
    if (typeof body === 'string') {
      const ct = headers.get('content-type') || ''
      data = ct.includes('application/json') || body.trim().startsWith('{') || body.trim().startsWith('[')
        ? JSON.parse(body)
        : body
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json')
      }
    } else {
      data = body
    }
  }

  const headerObj: Record<string, string> = {}
  headers.forEach((v, k) => {
    headerObj[k] = v
  })

  const config: AxiosRequestConfig = {
    url: input,
    method: method as AxiosRequestConfig['method'],
    headers: headerObj,
    data,
    validateStatus: () => true,
  }

  const res: AxiosResponse = await api.request(config)
  const payload =
    typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? null)

  const responseHeaders = new Headers()
  Object.entries(res.headers).forEach(([k, v]) => {
    if (v == null) return
    responseHeaders.set(k, Array.isArray(v) ? v.join(', ') : String(v))
  })
  if (!responseHeaders.has('content-type')) {
    responseHeaders.set('content-type', 'application/json')
  }

  return new Response(payload, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  })
}
