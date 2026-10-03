# Memory — Zaptivo

Last updated: 2026-10-03

Índice da memória do projeto. **Leia isto no início de toda sessão de IA** antes de propor arquitetura ou refactors grandes.

## Product

- **Name:** Zaptivo
- **What:** CRM de WhatsApp (inbox, contatos, pipelines, broadcasts, automações, AI reply)
- **Use:** interno hoje; SaaS / script embed no futuro
- **Stack canônica:** Next.js 16 (App Router) + Prisma + Postgres + Auth.js + WAHA
- **Owner:** Abner

## Layout (não reverter)

```
src/app          — UI + Route Handlers (/api/*)
src/domain       — regras de negócio (server-only intent)
src/components   — UI
src/lib          — helpers de cliente (api client, utils, themes)
prisma/          — schema + migrations (na raiz)
```

## Working rules

- **Um app Next na raiz** — sem Turborepo, sem Nest, sem `apps/web` + `apps/api`.
- **Não reintroduzir** monorepo (`turbo.json`, `pnpm-workspace.yaml`, `packages/*` de app).
- **Não reintroduzir** Supabase client / stubs / migrations SQL antigas como caminho de schema.
- **Domínio em `src/domain`**, nunca `src/server` (colide com `next/server` no Turbopack).
- **Um `.env` na raiz**, um `Dockerfile`, deploy Dokploy single-service.
- API pública e webhooks: same-origin `/api/v1`, `/api/whatsapp/webhook`.
- Não commit/push sem pedido explícito.
- Antes de mudar arquitetura: ler `.claude/adr/` e este MEMORY.

## Pointers

| Recurso | Path |
|---------|------|
| ADRs | `.claude/adr/` |
| Session / AI log | `docs/session-log.md` |
| Runbook | `docs/runbook-local.md` |
| Deploy | `docs/dokploy.md` |
| API pública | `docs/public-api.md` |

## Topic notes

- [Arquitetura unificada Next](arquitetura-next-unificado.md)
- [Anti-padrões proibidos](anti-padroes.md)
