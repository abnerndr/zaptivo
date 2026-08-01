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
| Domínio (prod) | `wacrm.ruperth.com` |

Envs mínimas (runtime):

```
DATABASE_URL=postgresql://...   # Auth.js adapter
AUTH_SECRET=<mesmo da api>
AUTH_URL=https://wacrm.ruperth.com
AUTH_TRUST_HOST=true
AUTH_COOKIE_DOMAIN=.ruperth.com
APP_LOCALE=pt-BR
API_PUBLIC_URL=https://wacrm-api.ruperth.com
API_INTERNAL_URL=http://wacrm-api-vd0dfr:4000
NEXT_PUBLIC_SITE_URL=https://wacrm.ruperth.com
NEXT_PUBLIC_API_URL=https://wacrm-api.ruperth.com
ENCRYPTION_KEY=...
```

**Build Args** (recomendados — `NEXT_PUBLIC_*` também entra no bundle):

```
NEXT_PUBLIC_SITE_URL=https://wacrm.ruperth.com
NEXT_PUBLIC_API_URL=https://wacrm-api.ruperth.com
NEXT_PUBLIC_APP_LOCALE=pt-BR
```

`APP_LOCALE` e `API_PUBLIC_URL` valem em runtime (sem rebuild). O layout injeta `API_PUBLIC_URL` no browser.

## API (prod)

| Campo | Valor |
|-------|-------|
| Domínio | `wacrm-api.ruperth.com` |
| Port | `4000` |

## Cookies cross-subdomain

Para o browser enviar o JWT Auth.js à API:

1. `AUTH_COOKIE_DOMAIN=.ruperth.com` no **web**
2. `WEB_ORIGIN=https://wacrm.ruperth.com` na **api** (CORS + credentials)
3. `NEXT_PUBLIC_API_URL=https://wacrm-api.ruperth.com` no **web** (também nos **Build Args**)

## Webhooks / cron

Aponte Meta/WAHA webhooks e crons de automations/flows para o host da **API** (`https://wacrm-api.ruperth.com/...`).
