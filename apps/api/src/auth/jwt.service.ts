import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { decode } from 'next-auth/jwt'

export type DecodedSession = {
  sub?: string
  [key: string]: unknown
}

@Injectable()
export class JwtService {
  constructor(private readonly config: ConfigService) {}

  async decodeSessionToken(token: string): Promise<DecodedSession | null> {
    const secret = this.config.get<string>('AUTH_SECRET')
    if (!secret) return null

    try {
      // Auth.js v5 JWTDecodeParams requires `salt` (cookie name).
      const salts = [
        '__Secure-authjs.session-token',
        'authjs.session-token',
        '__Secure-next-auth.session-token',
        'next-auth.session-token',
      ]
      for (const salt of salts) {
        try {
          const decoded = await decode({ token, secret, salt })
          if (decoded && typeof decoded === 'object') {
            return decoded as DecodedSession
          }
        } catch {
          // try next salt
        }
      }
      return null
    } catch {
      return null
    }
  }
}
