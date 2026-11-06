# Runbook local e operação WhatsApp

## Pré-requisitos e bootstrap

1. Postgres 16: `docker compose up -d db`.
2. Provedor acessível: WuzAPI para a conta piloto; Evolution para contas existentes ou rollback. Uma URL `localhost` só é acessível ao provedor se ambos compartilharem essa rede; use uma origem pública HTTPS para callbacks externos.
3. Copie `.env.example` para `.env` e configure `DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY` e as variáveis do provedor. Configure `R2_*` para mídia. Se `DATABASE_URL` usar pooler, configure `DIRECT_DATABASE_URL` com uma sessão direta para LISTEN.

```bash
docker compose up -d db
pnpm install
pnpm db:generate
pnpm db:migrate
SEED_ADMIN_PASSWORD='sua-senha-forte' pnpm db:seed
pnpm dev
```

Seed: `SEED_ADMIN_CPF` (default `52998224725`), `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`. Reset: `SEED_ADMIN_RESET=1`.

## Configuração do callback

- `NEXT_PUBLIC_SITE_URL`: origem pública do app; no Dokploy configure também como build arg. Em produção use HTTPS e confirme DNS e acesso externo.
- `WUZAPI_BASE_URL`: URL base real da API contratada, incluindo eventual prefixo de instalação (ex.: `https://wuzapi.juspilot.com/api`). Não use a URL da documentação como base.
- `WUZAPI_ADMIN_TOKEN`: token admin da instalação (criar/listar/apagar usuários-instância). Aceita alias `WUZAPI_API_KEY`. O token **por conta** é gerado no painel e fica criptografado em `whatsapp_config`; não coloque o token de usuário nesta env.
- `WUZAPI_WEBHOOK_URL` e `EVOLUTION_WEBHOOK_URL`: overrides opcionais e **URLs completas**. Quando ausentes, cada callback é derivado da origem de `NEXT_PUBLIC_SITE_URL` com `/webhook/whatsapp`.
- `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_WEBHOOK_SECRET`: Evolution para contas legadas/rollback. `ENCRYPTION_KEY` protege credenciais persistidas.

Em produção o validador exige HTTPS e rejeita hosts locais ou endereços privados óbvios. Isso não comprova DNS público ou conectividade: teste a partir de fora da rede Dokploy. A nova rota pública deve encaminhar internamente o POST para `/api/whatsapp/webhook`, sem redirect e preservando corpo e autenticação; a rota antiga permanece durante a migração.

## Conectar e verificar uma conta

Fluxo atual no painel (branch `feat/wuzapi-controle`):

1. Configure `WUZAPI_BASE_URL` + `WUZAPI_ADMIN_TOKEN` (ou `WUZAPI_API_KEY`) e `NEXT_PUBLIC_SITE_URL` público HTTPS.
2. Em Configurações → WhatsApp, escolha **WuzAPI**, informe um nome e clique em **Criar instância WuzAPI**. O app cria o usuário na WuzAPI, grava o token criptografado e registra o webhook (`token` header nos endpoints de usuário; admin usa `Authorization`).
3. Clique em **QR**, escaneie no telefone e confirme status `WORKING`.
4. Use **Sincronizar** (`POST /api/whatsapp/sync`) para importar nomes/fotos. Em Contatos: Remover e Blacklist/Desbloquear.
5. Chat: envio de texto e recebimento via `POST /webhook/whatsapp` (header `token` da conta) alimentam o SSE existente.
6. Contas Evolution existentes permanecem até migração explícita; rollback reativa Evolution e remove o emissor WuzAPI do número.

## Rollback por conta

1. Pause novos envios e automações da conta afetada; mantenha o histórico e os IDs locais. Identifique operações pendentes e resultados incertos, compare com o provedor e os recibos, e reconcilie antes de qualquer reenvio. Não repita cegamente um timeout que possa ter sido aceito.
2. Desative o emissor WuzAPI para o número. Restabeleça a seleção e a sessão Evolution anteriores, preservando IDs locais, contatos, conversas e histórico, além da associação dos IDs remotos aos respectivos provedor e conta. Reautentique com QR se necessário.
3. Registre ou reconcilie o callback anterior, leia a configuração de volta e valide um evento autenticado externo e um envio controlado. Verifique que só há um emissor ativo, que não houve duplicação e que os atendentes veem o mesmo estado.
4. Reabilite a conta progressivamente e acompanhe pendências, falhas e recibos. Não reverta dados ou migrações de forma destrutiva como parte do rollback operacional; use o procedimento de migração validado separadamente.

## Deploy

Ver [dokploy.md](./dokploy.md) e [ADR-007](../.claude/adr/007-wuzapi-sse-postgres.md).
