import { All, Controller, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import {
  getRequestBaseUrl,
  invokeRouteHandler,
  type RouteHandlerModule,
} from './next-adapter'
import {
  loadRouteModule,
  pathToSegments,
  resolveRouteImportPath,
} from './route-resolver'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const
type HttpMethod = (typeof HTTP_METHODS)[number]

function normalizePath(rawPath: string): string {
  const withoutQuery = rawPath.split('?')[0] ?? rawPath
  return withoutQuery.replace(/\/+$/, '') || '/'
}

function extractPathname(req: Request): string {
  const params = req.params as Record<string, string | string[] | undefined>

  // Nest `@All('*path')` puts the remainder in params.path
  const splat = params.path ?? params['0']
  if (typeof splat === 'string' && splat.length > 0) {
    return normalizePath(`/${splat}`)
  }
  if (Array.isArray(splat) && splat.length > 0) {
    return normalizePath(`/${splat.join('/')}`)
  }

  let pathname = req.path || req.url.split('?')[0] || '/'
  if (pathname.startsWith('/api/')) {
    pathname = pathname.slice(4)
  } else if (pathname === '/api') {
    pathname = '/'
  }
  return normalizePath(pathname)
}

@Controller()
export class HttpBridgeController {
  @All('*path')
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const pathname = extractPathname(req)
    const segments = pathToSegments(pathname)

    if (segments.length === 0) {
      res.status(404).json({ error: 'Not Found' })
      return
    }

    const importPath = resolveRouteImportPath(segments)
    if (!importPath) {
      res.status(404).json({ error: 'Not Found' })
      return
    }

    let routeModule: RouteHandlerModule
    try {
      routeModule = (await loadRouteModule(importPath)) as RouteHandlerModule
    } catch {
      res.status(404).json({ error: 'Not Found' })
      return
    }

    const method = (req.method ?? 'GET').toUpperCase() as HttpMethod
    if (!HTTP_METHODS.includes(method)) {
      res.status(405).json({ error: 'Method Not Allowed' })
      return
    }

    const handler = routeModule[method]
    if (!handler) {
      if (method === 'OPTIONS') {
        res.status(204).end()
        return
      }
      res.status(405).json({ error: 'Method Not Allowed' })
      return
    }

    const baseUrl = getRequestBaseUrl(req)
    await invokeRouteHandler(handler, req, res, baseUrl)
  }
}
