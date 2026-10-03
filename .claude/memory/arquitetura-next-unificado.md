---
type: project
date: 2026-10-03
---

# Arquitetura unificada Next.js

## O que foi decidido

O CRM deixou de ser monorepo Next + Nest. Tudo roda em **um processo Next.js** na raiz do repo.

## Por quê

- Vibecoding se perdia entre `web` e `api` com o mesmo domínio duplicado
- Dois `.env`, dois Dockerfiles, dois serviços no Dokploy
- Nest era bridge de Route Handlers Next — sem ganho real no estágio atual
- SaaS futuro (API keys + widget) cabe em `/api/v1` no mesmo app

## Como validar

- Não existe `apps/api`, `packages/database`, `turbo.json`
- `pnpm dev` sobe só `:3000`
- Rotas de negócio em `src/app/api/**` importam de `@/domain/**`
