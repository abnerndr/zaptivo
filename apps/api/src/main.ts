import 'reflect-metadata'
import { register } from 'tsconfig-paths'
import { join } from 'node:path'

register({
  baseUrl: join(__dirname),
  paths: { '@/*': ['./*'] },
})

import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  const config = app.get(ConfigService)
  const webOrigin = config.get<string>('WEB_ORIGIN', 'http://localhost:3000')

  app.setGlobalPrefix('api')
  const allowedOrigins = webOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Non-browser / same-origin proxy callers omit Origin
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      callback(null, false)
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Cookie',
    ],
  })
  app.use(cookieParser())

  const port = Number(config.get('PORT') ?? 4000)
  await app.listen(port)
}

void bootstrap()
