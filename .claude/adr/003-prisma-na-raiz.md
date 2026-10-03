# ADR-003 — Prisma na raiz do projeto

**Status:** Aceito  
**Data:** 2026-10-03  

---

## Decisão

Schema, migrations e seed vivem em `prisma/` na raiz. Client em `src/domain/db/prisma.ts`. Scripts `pnpm db:*` no `package.json` raiz.

## Alternativas

1. `packages/database` no monorepo — overhead e filters. Descartada.
2. Prisma só dentro de um app nested — obsoleto após flatten. Descartada.
3. Prisma na raiz — escolhida.

## Consequências

- `DATABASE_URL` no `.env` raiz
- `prisma migrate deploy` no start do Docker
