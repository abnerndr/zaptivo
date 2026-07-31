import { Injectable, OnModuleDestroy } from '@nestjs/common'
import type { Pool } from 'pg'
import { prisma, getPgPool, PrismaClient } from '@wacrm/database'

@Injectable()
export class PrismaService implements OnModuleDestroy {
  get client(): PrismaClient {
    return prisma
  }

  get pool(): Pool {
    return getPgPool()
  }

  async onModuleDestroy() {
    await prisma.$disconnect().catch(() => {})
  }
}

export { prisma, getPgPool, PrismaClient }
