# Deploy no Dokploy (Next.js)

Um serviço, build context = raiz do repositório.

## App

| Campo | Valor |
|-------|-------|
| Dockerfile | `Dockerfile` |
| Port | `3000` |
| Domínio | `app.seu-dominio.com` |

### Envs de runtime

```
DATABASE_URL=postgresql://...
AUTH_SECRET=<secret>
AUTH_URL=https://app.seu-dominio.com
AUTH_TRUST_HOST=true
NEXT_PUBLIC_SITE_URL=https://app.seu-dominio.com
NEXT_PUBLIC_APP_LOCALE=pt-BR
ENCRYPTION_KEY=...
# DIRECT_DATABASE_URL=  # sessão direta, se DATABASE_URL for pooler
WUZAPI_BASE_URL=https://wuzapi.seu-dominio.com
# WUZAPI_WEBHOOK_URL=https://app.seu-dominio.com/webhook/whatsapp
WUZAPI_ADMIN_TOKEN=
# + R2 / SendGrid / AI conforme uso
```

### Build Args

```
NEXT_PUBLIC_SITE_URL=https://app.seu-dominio.com
NEXT_PUBLIC_APP_LOCALE=pt-BR
```

**Não defina `NODE_ENV`** (nem em env nem em build arg). Os scripts `build`/`start` do `package.json` forçam `NODE_ENV=production` (o build type Nixpacks repassa todas as envs do Dokploy para o build); sem isso, `NODE_ENV=development` faz o build quebrar no prerender de `/` (`TypeError: Cannot read properties of undefined (reading 'length')` + avisos de `key` em `<head>`/`<meta>`).

O container roda `prisma migrate deploy` no start e sobe o Next.

## Webhooks / cron

Configure os callbacks dos provedores e os crons no mesmo host. Os overrides de webhook são URLs completas; quando ausentes, usa-se a origem de `NEXT_PUBLIC_SITE_URL` com `/webhook/whatsapp`. A rota anterior permanece durante a migração. Confirme a implantação e a autenticação antes da troca; consulte o [runbook](./runbook-local.md).

- `https://app.seu-dominio.com/webhook/whatsapp` (callback público; rota anterior `/api/whatsapp/webhook` durante a migração)
- `https://app.seu-dominio.com/api/automations/cron`
- `https://app.seu-dominio.com/api/flows/cron`

## API pública

- `https://app.seu-dominio.com/api/v1/...` com API keys
