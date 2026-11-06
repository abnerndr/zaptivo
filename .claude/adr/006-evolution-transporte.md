# ADR-006 — Evolution API no lugar do WAHA

**Status:** Aceito  
**Data:** 2026-10-16  
**Substitui:** o transporte WhatsApp descrito em ADR-004 (webhooks WAHA). O restante de ADR-004 permanece: um Dockerfile, um serviço Dokploy, um domínio.

---

## Contexto

O atendimento passa a entrar e sair pela Evolution API v2. O CRM continua a fonte da verdade de contatos, conversas e histórico. A resposta automática só roda quando a conversa não está pausada para um humano. Não há n8n neste ciclo.

## Decisão

- Transporte: Evolution API v2. Header `apikey`. Instância gravada em `whatsapp_config.waha_session` (o nome da coluna fica até uma migração de rename).
- Webhook: `POST /api/whatsapp/webhook`. Grava a mensagem, enfileira o agente e responde 200 sem esperar o modelo.
- Worker: no mesmo processo Next. Debounce de 4 segundos em memória. Sem Redis, sem BullMQ, sem segundo container.
- Envio da resposta: `POST /message/sendText/{instance}` e `POST /message/sendMedia/{instance}`.
- Eventos para automações externas não são emitidos. O n8n não entra.

## Alternativas

- Manter WAHA. Recusada: o transporte pedido é a Evolution.
- Fila BullMQ e worker em outro serviço. Recusada: contradiz o deploy de um serviço só.

## Consequências

- `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY` e, no webhook, `EVOLUTION_WEBHOOK_SECRET` (ou a mesma API key).
- `WAHA_*` deixa de ser o caminho do inbox.
- Sincronizar histórico pelo WAHA não roda mais. Mensagens novas chegam pelo webhook.


## Adendo — 2026-11-05

A URL pública para novos registros é `POST /webhook/whatsapp`, encaminhada internamente ao handler de `/api/whatsapp/webhook`, preservando método, corpo e autenticação, sem redirecionamento HTTP. A rota anterior permanece disponível durante a migração. Overrides explícitos devem conter a URL completa.

O [ADR-007](007-wuzapi-sse-postgres.md) substitui a escolha de transporte e a decisão de debounce apenas em memória deste ADR. Evolution permanece disponível para contas existentes e rollback; o histórico acima registra a decisão original. A implantação da nova rota e a validação ponta a ponta fazem parte da entrega, não são presumidas por este adendo.
