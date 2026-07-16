# Local runbook — Prisma + Auth.js + R2 + SSE + WAHA

## Prerequisites

1. **Postgres 16** — `docker compose up -d` (ative integração WSL no Docker Desktop se preciso)
2. **WAHA** na porta **3001** — [docs JS/TS](https://waha.devlike.pro/docs/integrations/javascript/)
3. **Cloudflare R2** — preencha `R2_*` em `.env.local`
4. Secrets já gerados em `.env.local` (`AUTH_SECRET`, `ENCRYPTION_KEY`, `WAHA_WEBHOOK_SECRET`)

## Bootstrap

```bash
# Prisma CLI lê .env (DATABASE_URL). App Next lê .env.local.
docker compose up -d
npx prisma migrate deploy   # ou: npx prisma migrate dev
npx prisma generate
npm run dev
```

## Fluxo mínimo para validar

1. http://localhost:3000/signup — CPF válido + senha (≥8) + nome
2. Login com CPF/senha
3. **Contatos** — listar/criar via `/api/contacts`
4. **Settings → WhatsApp** — nome da sessão WAHA → Salvar → QR → status WORKING
5. Webhook WAHA → `{SITE}/api/whatsapp/webhook` com header `X-Waha-Webhook-Secret`
6. **Inbox** — conversas/mensagens + envio texto via WAHA

## Status da migração

| Área | Estado |
|------|--------|
| Prisma schema + client | Pronto |
| Auth.js CPF/senha | Pronto |
| Contatos + Inbox (UI nova) | Pronto (versão enxuta) |
| WhatsApp Settings (WAHA) | Pronto |
| R2 upload API | Pronto |
| SSE realtime | Pronto |
| send-message → WAHA | Pronto |
| Templates locais API | Pronto (sync Meta = 410) |
| Pipelines / Broadcasts / Automations / Flows / AI UIs | **Shell “em migração”** — APIs em stub Prisma |
| Engines flows/automations/AI | Stubs — reimplementar sobre Prisma |
| Public API `/api/v1` | Shell autenticado — expandir queries |
| Pacotes `@supabase/*` | Removidos |

## Observações

- Sessão Auth.js usa **JWT** (exigência do provider Credentials); usuários ficam no Postgres.
- Model CRM tenant = `Tenant` → tabela `accounts`; Auth.js OAuth = `Account` → `auth_accounts`.
- `tsc --noEmit` está limpo (testes `*.test.ts` excluídos do `tsconfig` temporariamente).
- Spec: `docs/superpowers/specs/2026-07-15-prisma-waha-migration-design.md`
- Plano: `docs/superpowers/plans/2026-07-15-prisma-waha-migration.md`
