import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { AUTH_COOKIE_NAMES } from '@wacrm/shared'
import { JwtService } from './jwt.service'
import { IS_PUBLIC_KEY } from './public.decorator'

export type RequestWithAuth = Request & {
  authUserId?: string
  authName?: string | null
  authEmail?: string | null
  authImage?: string | null
}

function readSessionCookie(req: Request): string | undefined {
  for (const name of AUTH_COOKIE_NAMES) {
    const value = req.cookies?.[name]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithAuth>()
    const cookie = readSessionCookie(req)
    const decoded = cookie ? await this.jwt.decodeSessionToken(cookie) : null
    const userId = decoded?.sub

    if (userId) {
      req.authUserId = userId
      req.authName =
        typeof decoded?.name === 'string' ? decoded.name : null
      req.authEmail =
        typeof decoded?.email === 'string' ? decoded.email : null
      req.authImage =
        typeof decoded?.picture === 'string'
          ? decoded.picture
          : typeof decoded?.image === 'string'
            ? decoded.image
            : null
    }

    void this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    return true
  }
}
