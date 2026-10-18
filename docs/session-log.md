# Session log (IA)

Registro **append-only** de mudanças relevantes feitas por agentes de IA.  
Não edite entradas antigas — só acrescente no topo (mais recente primeiro).

---

## 2026-10-16 — Evolution API no lugar do WAHA

### O que foi feito
- O webhook, o envio e o QR passam a falar com a Evolution API v2.
- A mensagem é gravada, o agente é enfileirado no mesmo processo e o webhook responde 200 sem esperar o modelo.
- Sem n8n. Sem segundo serviço.

### Por que
- O transporte pedido é a Evolution. O CRM continua a fonte da verdade.

### Onde revisar
- `src/app/api/whatsapp/webhook/route.ts`
- `src/domain/whatsapp/evolution-api.ts`
- `src/domain/whatsapp/agent-job.ts`
- `.claude/adr/006-evolution-transporte.md`

### Impacto
- [x] Backend
- [x] Deploy

### Risco / Atenção
- `EVOLUTION_BASE_URL` e `EVOLUTION_API_KEY` precisam ser preenchidos. O nome da instância continua no campo da sessão do WhatsApp.
- A sincronização de histórico do WAHA não roda mais.

### Como validar
- `pnpm exec vitest run src/domain/whatsapp/evolution-event.test.ts src/domain/whatsapp/agent-queue.test.ts`

---

## 2026-10-16 — Envs do chat ao vivo

### O que foi feito
- `.env` e `.env.example` ganharam `DIRECT_DATABASE_URL` e `WAHA_EVENT_CONSUMER`.
- Saíram `META_APP_ID`, `META_APP_SECRET`, `ALLOWED_INVITE_HOSTS` e `WAHA_TEMPLATES_DRY_RUN`.

### Por que
- O LISTEN do chat e o consumidor do WAHA leem essas duas variáveis. As da Meta e as duas opcionais não são lidas por nenhuma rota.

### Onde revisar
- `.env`
- `.env.example`
- `docs/dokploy.md`

### Impacto
- [x] Deploy
- [x] DX

### Risco / Atenção
- `WAHA_EVENT_CONSUMER` ficou `0`. O socket só abre com `1`.
- `DIRECT_DATABASE_URL` no `.env` local aponta para o mesmo Postgres da `DATABASE_URL`, porta 5436.

### Como validar
- Subir o app e abrir o inbox. O SSE usa a URL direta. Com `WAHA_EVENT_CONSUMER=0` o processo não abre WebSocket.

---

## 2026-10-10 — Chat, contatos e automações na branch feat/chat-contato-automacao

### O que foi feito
- Identidade: telefone só por igualdade de dígitos, nome travado (`nameLocked`), listagem da inbox sem fusão.
- Tempo real: notify antes do LID, bolha por append, LISTEN em URL de sessão.
- Mídia na conversa, com download só da origem do WAHA.
- Tipo opcional do contato e disparo de template (agora ou agendado, no máximo 50 contatos).
- Menu sem pipelines, broadcasts, flows e agentes. Flows não rodam no inbound.
- Consumidor WebSocket do WAHA no processo do Next, desligado sem `WAHA_EVENT_CONSUMER=1`.

### Por que
- O chat esperava a resolução do LID e refazia a conta inteira. O nome salvo sumia na fusão.

### Onde revisar
- `src/domain/whatsapp/inbound.ts`
- `src/hooks/inbox/use-inbox-queries.ts`
- `src/domain/template-dispatches/run.ts`
- `prisma/migrations/20260801000000_contact_name_locked`
- `prisma/migrations/20260802000000_contact_type`
- `prisma/migrations/20260803000000_template_dispatch`

### Impacto
- [x] Backend
- [x] Frontend
- [x] DB

### Risco / Atenção
- As três migrations ainda não foram aplicadas no Postgres remoto. O start de produção roda `prisma migrate deploy`.
- SSE em pooler precisa de `DIRECT_DATABASE_URL`.
- A página de contatos e a de automações não foram clicadas no browser. O socket do WAHA não foi aberto ao vivo.

### Como validar
- `./node_modules/.bin/vitest run` — 75 arquivos, 571 testes, na última execução.
- `./node_modules/.bin/tsc --noEmit` — exit 0.

---

## 2026-10-10 — Planos do chat, contatos e automações

### O que foi feito
- Sete planos de implementação a partir do diagnóstico e das decisões fechadas
- Índice em `docs/superpowers/plans/2026-10-10-00-indice.md`

### Por que
- O diagnóstico não era executável. As decisões (caminho A+B, mídia, automação imediata e agendada, type opcional, menu só) precisavam virar tarefas com teste e código antes de mexer no produto.

### Onde revisar
- `docs/superpowers/plans/2026-10-10-00-indice.md`

### Impacto
- [x] Nenhum (só documentação)

### Risco / Atenção
- Nenhum código de produto mudou. O plano 7 só segue depois da sonda do WAHA. `PRISMA_SCHEMA_VERSION` sobe 4, 5 e 6 nos planos 1, 4 e 5, nessa ordem.

### Como validar
- Ler o índice e confirmar que cada plano tem teste que falha antes da implementação.

---

## 2026-10-10 — Diagnóstico do chat em tempo real (sem mudança de produto)

### O que foi feito
- Leitura do fluxo inbox → webhook WAHA → ingest → `pg_notify` → SSE → refetch
- Mapa do que está implementado e do que ficou em stub após a unificação Next
- Documento `docs/analise-chat-tempo-real.md`

### Por que
- Chat lento e sem atualização ao vivo; salvar contato instável; recorte futuro para chat, contatos, automações com templates e categoria `type`

### Onde revisar
- `docs/analise-chat-tempo-real.md`

### Impacto
- [x] Nenhum (só documentação)

### Risco / Atenção
- Nenhum código de produto mudou. Execução fica para o segundo markdown.

### Como validar
- Ler o diagnóstico e cruzar com o próximo arquivo antes de implementar.

---

## 2026-10-04 — Fix deploy: dependência `shadcn` faltando

### O que foi feito
- Adicionou `shadcn@^4.11.0` ao `package.json` da raiz (perdido no flatten)
- Validou `pnpm build` local com sucesso

### Por que
- Dokploy falhava em `Can't resolve 'shadcn/tailwind.css'` — import em `globals.css` sem o pacote

### Onde revisar
- `package.json` / `pnpm-lock.yaml`
- `src/app/globals.css` (`@import "shadcn/tailwind.css"`)

### Impacto
- [x] Frontend / Build / Deploy
- [ ] Backend / DB

### Risco / Atenção
- Precisa commit + push para o redeploy no Dokploy pegar o lockfile

### Como validar
- `pnpm build` (já OK localmente)
- Redeploy Dokploy após push

---

## 2026-10-03 — Unificação Next + flatten + harness

### O que foi feito
- Aposentou Nest / monorepo Turborepo; app Next na raiz
- Domínio em `src/domain` (não `src/server`)
- Prisma na raiz; removeu `@wacrm/database`, stubs Supabase, `packages/shared`, MCP opcional, docs legadas
- Criou harness `.claude/memory`, `.claude/adr`, este session-log e regra Cursor

### Por que
- Manutenção e vibecoding quebravam com web+api duplicados
- Evitar regressão das decisões de arquitetura em sessões futuras

### Onde revisar
- `.claude/adr/001`–`005`
- `.claude/memory/MEMORY.md`
- `src/app/api/**`, `src/domain/**`, `Dockerfile`

### Impacto
- [x] Frontend
- [x] Backend (API no Next)
- [ ] DB schema (estrutura de pasta Prisma, sem mudança de modelo neste log)
- [x] Deploy / ops
- [x] DX / vibecoding

### Risco / Atenção
- Dokploy: apontar para `Dockerfile` na raiz; desligar serviço Nest antigo
- Webhooks WAHA devem ir para o host único do Next

### Como validar
- `pnpm typecheck && pnpm test && pnpm build`
- `pnpm dev` só na porta 3000

## 2026-10-17 — build Dokploy quebrando no prerender de `/`

- Causa: `NODE_ENV=development` nas envs do Dokploy (vindo do `.env.example`). Reproduzido local; sem a variável o build passa (77/77).
- `.env.example` não define mais `NODE_ENV`; `docs/dokploy.md` avisa para não setar.
