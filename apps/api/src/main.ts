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
  app.enableCors({
    origin: webOrigin,
    credentials: true,
  })
  app.use(cookieParser())

  const port = Number(config.get('PORT') ?? 4000)
  await app.listen(port)
}

void bootstrap()
