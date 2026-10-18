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
EVOLUTION_BASE_URL=https://evolution.seu-dominio.com
EVOLUTION_API_KEY=
EVOLUTION_WEBHOOK_SECRET=
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

Aponte a Evolution e os crons para o mesmo host:

- `https://app.seu-dominio.com/api/whatsapp/webhook`
- `https://app.seu-dominio.com/api/automations/cron`
- `https://app.seu-dominio.com/api/flows/cron`

## API pública

- `https://app.seu-dominio.com/api/v1/...` com API keys
