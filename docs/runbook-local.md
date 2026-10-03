# Runbook local

## Prerequisites

1. Postgres 16 — `docker compose up -d db`
2. WAHA na porta 3001
3. `.env` com `DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `WAHA_*`, `R2_*`

## Bootstrap

```bash
docker compose up -d db
pnpm install
pnpm db:generate
pnpm db:migrate
SEED_ADMIN_PASSWORD='sua-senha-forte' pnpm db:seed
pnpm dev
```

Seed: `SEED_ADMIN_CPF` (default `52998224725`), `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`. Reset: `SEED_ADMIN_RESET=1`.

## Validar

1. http://localhost:3000/signup
2. Login → Contatos / Inbox
3. Settings → WhatsApp (sessão WAHA + QR)
4. Webhook WAHA → `{SITE}/api/whatsapp/webhook` (`X-Waha-Webhook-Secret`)

## Deploy

Ver [dokploy.md](./dokploy.md).
