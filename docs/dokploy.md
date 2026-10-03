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
# + WAHA / R2 / SendGrid / AI conforme uso
```

### Build Args

```
NEXT_PUBLIC_SITE_URL=https://app.seu-dominio.com
NEXT_PUBLIC_APP_LOCALE=pt-BR
```

O container roda `prisma migrate deploy` no start e sobe o Next.

## Webhooks / cron

Aponte WAHA e crons para o mesmo host:

- `https://app.seu-dominio.com/api/whatsapp/webhook`
- `https://app.seu-dominio.com/api/automations/cron`
- `https://app.seu-dominio.com/api/flows/cron`

## API pública

- `https://app.seu-dominio.com/api/v1/...` com API keys
