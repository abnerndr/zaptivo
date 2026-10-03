# Zaptivo

CRM de WhatsApp (inbox, contatos, pipelines, broadcasts, automações) — Next.js + Prisma + WAHA.

## Stack

- Next.js 16 (App Router) — UI + API
- Prisma + Postgres
- Auth.js (CPF/senha)
- WAHA (WhatsApp)

## Layout

```
src/app          — páginas + Route Handlers (/api/*)
src/domain       — regras de negócio
src/components   — UI
src/lib          — helpers de cliente
prisma/          — schema + migrations
```

## Dev

```bash
cp .env.example .env   # preencha DATABASE_URL, AUTH_SECRET, etc.
docker compose up -d db
pnpm install
pnpm db:generate
pnpm db:migrate
SEED_ADMIN_PASSWORD='sua-senha' pnpm db:seed
pnpm dev               # http://localhost:3000
```

## Docs

- [Runbook local](./docs/runbook-local.md)
- [Deploy Dokploy](./docs/dokploy.md)
- [API pública `/api/v1`](./docs/public-api.md)

## Scripts

| Comando | O quê |
|---------|--------|
| `pnpm dev` | Next em :3000 |
| `pnpm build` / `pnpm start` | produção |
| `pnpm test` / `pnpm typecheck` | qualidade |
| `pnpm db:*` | Prisma generate / migrate / seed / studio |
