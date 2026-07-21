# Deploy no Dokploy (Nixpacks)

## App

1. Crie um **Postgres** no Dokploy e anote a `DATABASE_URL` interna.
2. Crie a aplicação a partir do Git, **Build Type = Nixpacks**.
3. Porta: **3000** (o `nixpacks.toml` já usa `${PORT:-3000}`).
4. Domínio + HTTPS via Traefik como de costume.

O build/start usam:

- `nixpacks.toml` — Node 20, `npm ci --include=dev`, `prisma generate` + `next build`
- `npm run start:dokploy` — `prisma migrate deploy` e `next start -H 0.0.0.0`

## Variáveis de ambiente (obrigatórias)

| Variável | Notas |
|---|---|
| `DATABASE_URL` | URL do Postgres do Dokploy (`?schema=public`) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | 32 bytes hex/base64 conforme o app |
| `NEXT_PUBLIC_SITE_URL` | URL pública HTTPS do app |
| `NEXT_PUBLIC_APP_LOCALE` | ex. `pt-BR` |

## Storage (R2)

| Variável | Notas |
|---|---|
| `R2_ACCOUNT_ID` | |
| `R2_ACCESS_KEY_ID` | |
| `R2_SECRET_ACCESS_KEY` | |
| `R2_BUCKET` | |
| `R2_PUBLIC_URL` | URL pública do bucket |

## WAHA (serviço separado)

Suba o WAHA como outro app/compose no Dokploy. No wacrm:

| Variável | Notas |
|---|---|
| `WAHA_BASE_URL` | URL interna ou pública do WAHA (não use `localhost` entre containers) |
| `WAHA_API_KEY` | se habilitado no WAHA |
| `WAHA_WEBHOOK_SECRET` | deve bater com o webhook configurado |

Webhook tipicamente: `https://<seu-dominio>/api/whatsapp/webhook`

## Build

`DATABASE_URL` precisa existir no **runtime** (migrate + app). No build, `prisma generate` não precisa de DB vivo; se o Dokploy exigir a var no build, cole a mesma URL.

**Não rode `yarn db:migrate:sql`** — legado Supabase/Meta; corrompe o schema Prisma/WAHA.
O script está bloqueado por padrão. Canônico: `npx prisma migrate deploy` (já no `start:dokploy`).
