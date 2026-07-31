import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express'

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function expressToFetchRequest(
  req: ExpressRequest,
  baseUrl: string,
): Request {
  const url = new URL(req.originalUrl || req.url, baseUrl)
  const headers = new Headers()

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const part of value) headers.append(key, part)
    } else {
      headers.set(key, value)
    }
  }

  const method = (req.method ?? 'GET').toUpperCase()
  const hasBody = METHODS_WITH_BODY.has(method)

  const init: RequestInit = {
    method,
    headers,
  }

  if (hasBody) {
    // Express already parsed JSON / urlencoded into req.body.
    // Rebuild a Fetch body so Next-style handlers can call req.json().
    if (req.body !== undefined && req.body !== null) {
      if (Buffer.isBuffer(req.body)) {
        init.body = new Uint8Array(req.body)
      } else if (typeof req.body === 'string') {
        init.body = req.body
      } else {
        if (!headers.has('content-type')) {
          headers.set('content-type', 'application/json')
        }
        init.body = JSON.stringify(req.body)
      }
    }
  }

  return new Request(url, init)
}

export async function pipeFetchResponseToExpress(
  webResponse: Response,
  res: ExpressResponse,
): Promise<void> {
  res.status(webResponse.status)

  webResponse.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'transfer-encoding') return
    res.setHeader(key, value)
  })

  if (!webResponse.body) {
    res.end()
    return
  }

  const nodeStream = Readable.fromWeb(
    webResponse.body as import('stream/web').ReadableStream,
  )

  await new Promise<void>((resolve, reject) => {
    nodeStream.on('error', reject)
    res.on('error', reject)
    res.on('finish', resolve)
    nodeStream.pipe(res)
  })
}

export async function invokeRouteHandler(
  handler: (req: Request, context?: unknown) => unknown | Promise<unknown>,
  req: ExpressRequest,
  res: ExpressResponse,
  baseUrl: string,
): Promise<void> {
  const fetchReq = expressToFetchRequest(req, baseUrl)

  try {
    const result = await handler(fetchReq)
    if (result instanceof Response) {
      await pipeFetchResponseToExpress(result, res)
      return
    }

    if (result !== undefined && result !== null) {
      res.json(result)
      return
    }

    if (!res.headersSent) {
      res.status(204).end()
    }
  } catch (error) {
    if (error instanceof Response) {
      await pipeFetchResponseToExpress(error, res)
      return
    }
    throw error
  }
}

export function getRequestBaseUrl(req: IncomingMessage): string {
  const forwardedProto = req.headers['x-forwarded-proto']
  const protocol =
    (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ??
    'http'
  const host = req.headers.host ?? 'localhost:4000'
  return `${protocol}://${host}`
}

export type RouteHandler = (
  req: Request,
  context?: unknown,
) => unknown | Promise<unknown>

export type RouteHandlerModule = Partial<
  Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS', RouteHandler>
>

export function isServerResponse(value: unknown): value is ServerResponse {
  return Boolean(value && typeof value === 'object' && 'writeHead' in value)
}
