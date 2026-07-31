import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { HealthModule } from './health/health.module'
import { HttpBridgeModule } from './http/http-bridge.module'
import { PrismaModule } from './prisma/prisma.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    HttpBridgeModule,
  ],
})
export class AppModule {}
