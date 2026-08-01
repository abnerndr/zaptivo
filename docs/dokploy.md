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
API_PUBLIC_URL=
API_INTERNAL_URL=http://wacrm-api-vd0dfr:4000
NEXT_PUBLIC_SITE_URL=https://wacrm.ruperth.com
NEXT_PUBLIC_API_URL=
ENCRYPTION_KEY=...
```

`API_PUBLIC_URL` vazio → browser chama same-origin `/api/...` (proxy Next → Nest). Sem CORS.

`API_INTERNAL_URL` → Nest na rede Docker (server + proxy).

**Build Args** (recomendados):

```
NEXT_PUBLIC_SITE_URL=https://wacrm.ruperth.com
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_APP_LOCALE=pt-BR
```

## API (prod)

| Campo | Valor |
|-------|-------|
| Domínio | `wacrm-api.ruperth.com` |
| Port | `4000` |

## Cookies cross-subdomain

1. `AUTH_COOKIE_DOMAIN=.ruperth.com` no **web** (opcional se o browser só fala same-origin via proxy)
2. `WEB_ORIGIN=https://wacrm.ruperth.com` na **api** (CORS residual / clients diretos)
3. Browser usa same-origin `/api/*` (proxy Next); não aponta `API_PUBLIC_URL` para `wacrm-api`

## Webhooks / cron

Aponte Meta/WAHA webhooks e crons de automations/flows para o host da **API** (`https://wacrm-api.ruperth.com/...`).
