import { config } from 'dotenv'
import { resolve } from 'node:path'
import { defineConfig, env } from 'prisma/config'

// Load monorepo root .env then package-local .env
config({ path: resolve(__dirname, '../../.env') })
config({ path: resolve(__dirname, '.env') })

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://build:build@127.0.0.1:5432/build?schema=public'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // env() throws if unset — prefer process.env with build-time fallback
    url: process.env.DATABASE_URL ? env('DATABASE_URL') : databaseUrl,
  },
})
