import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { AuthContextInterceptor } from './auth-context.interceptor'
import { JwtService } from './jwt.service'
import { SessionAuthGuard } from './session-auth.guard'

@Module({
  providers: [
    JwtService,
    SessionAuthGuard,
    AuthContextInterceptor,
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuthContextInterceptor,
    },
  ],
  exports: [JwtService],
})
export class AuthModule {}
