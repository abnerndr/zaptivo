import { type NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Same-origin reverse proxy → Nest (@wacrm/api).
 *
 * Browser calls `/api/...` on the web host (no CORS). Auth.js keeps
 * `/api/auth/*` via the more-specific `app/api/auth/**` routes.
 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
])

function nestBaseUrl(): string {
  return (
    process.env.API_INTERNAL_URL ||
    process.env.API_PUBLIC_URL ||
    'http://localhost:4000'
  )
}

async function proxy(
  req: NextRequest,
  slug: string[],
): Promise<Response> {
  if (slug[0] === 'auth') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  const base = nestBaseUrl().replace(/\/+$/, '')
  const target = new URL(`${base}/api/${slug.map(encodeURIComponent).join('/')}`)
  target.search = req.nextUrl.search

  const headers = new Headers()
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value)
    }
  })

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer()
  }

  let upstream: Response
  try {
    upstream = await fetch(target, init)
  } catch (err) {
    console.error('[api-proxy] upstream fetch failed', target.toString(), err)
    return NextResponse.json(
      { error: 'Bad Gateway', detail: 'Nest API unreachable' },
      { status: 502 },
    )
  }

  const out = new Headers()
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP.has(lower)) return
    if (lower.startsWith('access-control-')) return
    out.set(key, value)
  })

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  })
}

type Ctx = { params: Promise<{ slug: string[] }> }

async function handle(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { slug } = await ctx.params
  return proxy(req, slug ?? [])
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
export const OPTIONS = handle
