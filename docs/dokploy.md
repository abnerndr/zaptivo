# Deploy no Dokploy (monorepo Turborepo)

Dois serviços a partir do **mesmo repositório**, build context = raiz.

## 1. API (`@wacrm/api`)

| Campo | Valor |
|-------|-------|
| Dockerfile | `apps/api/Dockerfile` |
| Port | `4000` |
| Domínio sugerido | `api.seu-dominio.com` |

Envs mínimas:

```
DATABASE_URL=postgresql://...
AUTH_SECRET=<mesmo do web>
WEB_ORIGIN=https://app.seu-dominio.com
PORT=4000
# + WAHA / R2 / SendGrid / AI conforme uso
```

O container roda `prisma migrate deploy` no start e sobe o Nest.

## 2. Web (`@wacrm/web`)

| Campo | Valor |
|-------|-------|
| Dockerfile | `apps/web/Dockerfile` |
| Port | `3000` |
| Domínio sugerido | `app.seu-dominio.com` |

Envs mínimas:

```
DATABASE_URL=postgresql://...   # só Auth.js adapter
AUTH_SECRET=<mesmo da api>
AUTH_URL=https://app.seu-dominio.com
AUTH_TRUST_HOST=true
AUTH_COOKIE_DOMAIN=.seu-dominio.com
NEXT_PUBLIC_SITE_URL=https://app.seu-dominio.com
NEXT_PUBLIC_API_URL=https://api.seu-dominio.com
ENCRYPTION_KEY=...
```

## Cookies cross-subdomain

Para o browser enviar o JWT Auth.js à API:

1. `AUTH_COOKIE_DOMAIN=.seu-dominio.com` no **web**
2. `WEB_ORIGIN=https://app.seu-dominio.com` na **api** (CORS + credentials)
3. `NEXT_PUBLIC_API_URL=https://api.seu-dominio.com` no **web**

## Webhooks / cron

Aponte Meta/WAHA webhooks e crons de automations/flows para o host da **API** (`https://api.../api/whatsapp/webhook`, etc.).
