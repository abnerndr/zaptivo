---
type: project
date: 2026-10-03
---

# Anti-padrões (não refazer)

| Não faça | Faça |
|----------|------|
| Recriar Nest / `apps/api` | Route Handlers em `src/app/api` |
| Pasta `src/server` | `src/domain` |
| Proxy Next → outro serviço para `/api` | Same-origin |
| Prisma em `packages/database` | `prisma/` na raiz |
| Stubs Supabase em `src/lib/supabase` | `prisma` + Auth.js |
| Turborepo / workspace packages de app | App único `package.json` |
| Dois Dockerfiles (web+api) | Um `Dockerfile` |
| Extrair microserviço “para SaaS” cedo | `/api/v1` + API keys; worker só com dor real |

Se uma sessão sugerir qualquer item da coluna esquerda, **pare** e cite o ADR correspondente.
