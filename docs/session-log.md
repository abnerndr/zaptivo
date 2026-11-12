# Session log (IA)

Registro **append-only** de mudanças relevantes feitas por agentes de IA.  
Não edite entradas antigas — só acrescente no topo (mais recente primeiro).

---

## 2026-11-12 — fix: busca obsoleta e foco na Inbox

### O que foi feito

- `src/app/(dashboard)/inbox/page.tsx`: resultados de contatos guardam a query que os gerou e só aparecem se igual à query atual; `searchGen` incrementa em toda execução do efeito (inclusive query curta); sem `setState` síncrono no efeito.
- Após abrir a conversa, `composerRef.current?.focus()` é chamado direto; o efeito de foco segue para quando o compositor monta depois.

### Por que

- Resposta atrasada podia mostrar contatos de uma query antiga; abrir a conversa já selecionada não focava a mensagem.

### Onde revisar

- Efeito de busca, `contactSearch` e `openChat` na página da Inbox.

### Impacto

- [x] Frontend
- [ ] Backend
- [ ] DB
- [ ] Deploy
- [ ] DX

### Risco / Atenção

- Tela ainda não verificada no navegador.

### Como validar

- `npx tsc --noEmit --pretty false`, os 3 testes vitest da inbox e `npx eslint` na página.

---

## 2026-11-12 — busca de contato ou número na Inbox

### O que foi feito

- Campo "Buscar contato ou número" no topo da coluna da Inbox em `src/app/(dashboard)/inbox/page.tsx`.
- Com 2+ caracteres, busca contatos salvos em `/api/contacts` (debounce de 300 ms; contador de geração descarta resposta velha, já que `apiFetch` não repassa `AbortSignal`).
- Clique em contato ou no número digitado chama `POST /api/inbox/conversations`, insere a conversa no cache, seleciona e foca o compositor. Não envia mensagem.
- Clique em uma conversa existente limpa a busca.

### Por que

- A Inbox só listava conversas já abertas. Não dava para achar um contato salvo nem começar um chat por telefone.

### Onde revisar

- `src/app/(dashboard)/inbox/page.tsx` (`openChat`, efeito da busca, `aside`)
- Consome `buildInboxStartResults` (`src/domain/inbox/start-chat.ts`) e a rota `src/app/api/inbox/conversations/route.ts`

### Impacto

- [x] Frontend
- [x] Backend
- [ ] DB
- [ ] Deploy
- [ ] DX

### Risco / Atenção

- Tela não verificada no navegador (sem sessão logada nem servidor no ar).
- ESLint acusa `react-hooks/set-state-in-effect` no efeito da busca (código do plano) e um `_created` não usado.

### Como validar

- `npx tsc --noEmit --pretty false`
- `npx vitest run src/domain/inbox/start-chat.test.ts src/domain/inbox/open-conversation.test.ts src/app/api/inbox/conversations/route.test.ts`
- Os cinco passos de "Como validar na tela" em `docs/superpowers/specs/2026-11-12-inbox-start-chat-design.md`

---

## 2026-11-12 — plano: iniciar chat pelo inbox

### O que foi feito

- Plano de implementação da busca no topo da Inbox, da abertura da conversa e do campo na página.

### Por que

- A spec foi aceita. O próximo passo é implementar sem inventar outro fluxo.

### Onde revisar

- `docs/superpowers/plans/2026-11-12-inbox-start-chat.md`

### Impacto

- [ ] Frontend
- [ ] Backend
- [ ] DB
- [ ] Deploy
- [x] DX

### Risco / Atenção

- Plano apenas. O prefixo `55` vale para o número digitado, não para o telefone já salvo no `contactId`.

### Como validar

- Revisão humana do plano antes da implementação.

---

## 2026-11-12 — spec: iniciar chat pelo inbox

### O que foi feito

- Spec da busca no topo da Inbox para abrir conversa de contato salvo ou de um número novo, sem enviar mensagem.

### Por que

- A Inbox só listava conversas já abertas. Não dava para achar um contato salvo nem começar um chat por telefone.

### Onde revisar

- `docs/superpowers/specs/2026-11-12-inbox-start-chat-design.md`

### Impacto

- [ ] Frontend
- [ ] Backend
- [ ] DB
- [ ] Deploy
- [x] DX

### Risco / Atenção

- Ainda é spec. Número local de 10 ou 11 dígitos será tratado como Brasil (`55`) na implementação.

### Como validar

- Revisão humana da spec antes do plano de implementação.

---

## 2026-11-11 — avatar WuzAPI 500 no sync

### O que foi feito

- `WuzapiTransport.avatar` trata HTTP 500 de foto ausente ou privada como `null`.
- Falha real de avatar passa a ser logada uma vez, sem o objeto `Error`.

### Por que

- A WuzAPI usa 500 em `/user/avatar` quando o contato não tem foto. O sync chamava isso para cada contato e o `console.warn` do `Error` enchia o terminal com stack.

### Onde revisar

- `src/domain/whatsapp/wuzapi-api.ts`
- `src/domain/whatsapp/ensure-contact-avatar.ts`

### Impacto

- [ ] Frontend
- [x] Backend
- [ ] DB
- [ ] Deploy
- [ ] DX

### Risco / Atenção

- Um 500 com prefixo `failed to get avatar` (incluindo falha transitória do whatsmeow) também vira “sem foto” nesta rodada. `no session` continua sendo erro.

### Como validar

- `npx vitest run src/domain/whatsapp/wuzapi-api.test.ts`
- Sincronizar contatos e conferir que o terminal não repete o stack de `WuzAPI HTTP 500`.

---

## 2026-11-11 — hydration mismatch no body

### O que foi feito

- `suppressHydrationWarning` no `<body>` do root layout.

### Por que

- A extensão ColorZilla injeta `cz-shortcut-listen="true"` no `<body>` antes da hidratação. O `<html>` já silenciava o mismatch de tema; o `<body>` não.

### Onde revisar

- `src/app/layout.tsx`

### Impacto

- [x] Frontend
- [ ] Backend
- [ ] DB
- [ ] Deploy
- [ ] DX

### Risco / Atenção

- O aviso só é suprimido nos atributos do próprio `<body>`. Mismatch em filhos continua aparecendo.

### Como validar

- Recarregar `/dashboard` com ColorZilla ativo e confirmar que o console não mostra mais o mismatch em `<body>`.

---

## 2026-11-10 — QR aparece como data URL

### O que foi feito

- `GET /api/whatsapp/session` devolve `{ qr: "data:image/png;base64,..." }` em vez de bytes PNG.

### Por que

- O cliente HTTP converte o corpo em texto. O byte `0x89` do PNG vira caractere de substituição e a tag `img` fica com largura zero.

### Onde revisar

- `src/app/api/whatsapp/session/route.ts`
- `src/components/settings/whatsapp-config.tsx`

### Impacto

- [x] Frontend
- [x] Backend
- [ ] DB
- [ ] Deploy
- [ ] DX

### Risco / Atenção

- O `src` da imagem precisa começar com `data:image`.

### Como validar

- Pedir o QR e conferir `naturalWidth` maior que zero.

---

## 2026-11-10 — QR deixa de virar HTTP 500

### O que foi feito

- O registro do webhook envia `WebhookURL`, que é o campo que esta WuzAPI persiste.
- QR com `not connected` vira “ainda não disponível” e a rota espera a sessão subir.
- `session/connect` com sessão já ativa não falha a criação.

### Por que

- O corpo antigo `{ webhook }` gravava URL vazia. Em seguida `GET /session/qr` respondia 500 `not connected`, e a tela mostrava `WuzAPI HTTP 500`.

### Onde revisar

- `src/domain/whatsapp/wuzapi-api.ts`
- `src/app/api/whatsapp/session/route.ts`

### Impacto

- [x] Frontend
- [x] Backend
- [ ] DB
- [ ] Deploy
- [ ] DX

### Risco / Atenção

- A instância de teste `zaptivo-debug` pode continuar listada na WuzAPI até ser removida no painel dela.

### Como validar

- `pnpm exec vitest run src/domain/whatsapp/wuzapi-api.test.ts`
- Criar ou abrir a instância e pedir o QR. A resposta não pode ser `WuzAPI HTTP 500`.

---

## 2026-11-10 — Desconectar só remove o vínculo local

### O que foi feito

- `DELETE /api/whatsapp/config` deixa de apagar o usuário na WuzAPI.
- Depois de desconectar, a tela recarrega a lista e a instância volta a poder ser vinculada.

### Por que

- Desconectar chamava `deleteUser(id, full)`, então a instância sumia da API e não havia o que vincular.

### Onde revisar

- `src/app/api/whatsapp/config/route.ts`
- `src/components/settings/whatsapp-config.tsx`

### Impacto

- [x] Frontend
- [x] Backend
- [ ] DB
- [ ] Deploy
- [ ] DX

### Risco / Atenção

- A instância `juspilot` já foi removida na WuzAPI por um desconectar anterior. O app não recria essa sessão.

### Como validar

- `pnpm exec vitest run src/app/api/whatsapp/config/route.test.ts`
- Desconectar uma instância ainda existente e conferir que ela continua em `GET /admin/users` e reaparece em Vincular.

---

## 2026-11-10 — WuzAPI lista instâncias na origem certa

### O que foi feito

- `WUZAPI_BASE_URL` passou a ser a origem da API (`https://wuzapi.juspilot.com`). O caminho `/api` desse host é o Swagger.
- A tela de WhatsApp lista as instâncias já existentes e permite vincular uma autenticada sem criar outro usuário nem regravar o webhook.

### Por que

- `POST /api/whatsapp/config` chamava `/api/admin/users`, recebia `404 page not found` e respondia `Invalid WuzAPI admin response`. A instância `juspilot` já estava autenticada na origem real.

### Onde revisar

- `src/domain/whatsapp/wuzapi-admin.ts`
- `src/app/api/whatsapp/config/route.ts`
- `src/components/settings/whatsapp-config.tsx`

### Impacto

- [x] Frontend
- [x] Backend
- [ ] DB
- [ ] Deploy
- [x] DX

### Risco / Atenção

- Vincular não altera o webhook da instância já autenticada. Criar uma instância nova ainda registra o webhook local.
- Reiniciar o `pnpm dev` para recarregar o `.env`.

### Como validar

- `pnpm exec vitest run src/domain/whatsapp/wuzapi-admin.test.ts src/app/api/whatsapp/config/route.test.ts`
- Em Configurações → WhatsApp, a instância existente aparece com status autenticada. Vincular não deve pedir QR.

---

## 2026-11-10 — Auth local não segue a URL de produção

### O que foi feito

- Fora de produção, `AUTH_URL` / `NEXTAUTH_URL` de host público e `AUTH_COOKIE_DOMAIN` público deixam de valer.
- Os redirects do proxy de autenticação usam o `Host` local da requisição.

### Por que

- O Auth.js reescreve a origem do request para `AUTH_URL`. Com a URL de produção, abrir localhost respondia 307 para `https://zapp.juspilot.com`. `NODE_ENV` no `.env` não controla isso.

### Onde revisar

- `src/domain/auth/local-origin.ts`, `src/auth.config.ts`.

### Impacto

- [ ] Frontend
- [x] Backend
- [ ] DB
- [ ] Deploy
- [x] DX

### Risco / Atenção

- Em produção (`NODE_ENV=production`) `AUTH_URL` e o domínio do cookie continuam valendo.
- Reiniciar o `pnpm dev` depois da mudança. Um 307 antigo pode ficar no cache do browser.

### Como validar

- `pnpm exec vitest run src/domain/auth/local-origin.test.ts`
- Abrir `http://localhost:3000/dashboard` e conferir que o `Location` permanece em localhost.

---

## 2026-11-06 — Vínculo de WhatsApp pela WuzAPI

### O que foi feito

- Espaço de trabalho oferece vínculo e QR pela WuzAPI; contas antigas precisam criar um novo vínculo sem excluir o histórico.
- Configuração, sessão, envio de texto e webhook usam somente WuzAPI; o padrão do banco para novos registros passa a ser WuzAPI.
- A mídia recebida usa os metadados do webhook para solicitar o download pela WuzAPI. Foram removidos os módulos e a sonda WAHA sem uso.
- ADR-008 registra a mudança e as variáveis de deploy foram atualizadas.

### Por que

- Concentrar a integração de WhatsApp na WuzAPI e permitir o vínculo pelo espaço de trabalho.

### Onde revisar

- `src/components/settings/whatsapp-config.tsx`, `src/app/api/whatsapp/`, `src/domain/whatsapp/` e `.claude/adr/008-wuzapi-unico.md`.

### Impacto

- [x] Frontend
- [x] Backend
- [x] DB
- [x] Deploy
- [ ] DX

### Risco / Atenção

- Aplicar a migration; configurar URL da WuzAPI, token admin, chave de criptografia e webhook público. Desconectar o provedor anterior antes de autenticar o mesmo número.
- O envio de mídia por WuzAPI ainda não está habilitado neste caminho; validar o recebimento de mídia e o QR na instância real. Há código legado Evolution com alterações preexistentes preservadas no workspace.

### Como validar

- Rodar os testes de configuração, webhook e WuzAPI; vincular a conta, escanear o QR e testar envio e recebimento no ambiente real.

---

## 2026-11-06 — Referência antiga ao WAHA nas configurações

### O que foi feito

- Removida a referência ao WAHA na descrição dos templates locais; respostas da IA e mensagens de texto de fluxos passaram a usar o transporte da conta.
- Impedido que fluxos enviem mídia de contas WuzAPI para a Evolution; esse caminho de mídia ainda precisa ser implementado.
- Verificado que o formulário de WhatsApp já apresenta WuzAPI e Evolution, mas a mensagem antiga ainda está nos arquivos compilados em `.next`.

### Por que

- Manter os textos das configurações alinhados aos provedores atuais.

### Onde revisar

- `src/components/settings/template-manager.tsx`, `src/domain/whatsapp/agent-job.ts` e `src/domain/flows/waha-send.ts`.

### Impacto

- [x] Frontend
- [x] Backend
- [ ] DB
- [ ] Deploy
- [ ] DX

### Risco / Atenção

- A versão em execução precisa ser reconstruída ou reiniciada com o código atual para atualizar a tela.
- A remoção dos provedores antigos ainda não foi concluída; contas existentes e mídia exigem migração.

### Como validar

- Abrir as configurações de WhatsApp e templates após atualizar a aplicação.
- Validar respostas da IA e envios de fluxo com uma conta WuzAPI configurada.

---

## 2026-11-05 — WuzAPI controle total (instâncias + chat + contatos)

### O que foi feito

- Plano `docs/superpowers/plans/2026-11-05-wuzapi-controle-total.md` executado na branch `feat/wuzapi-controle`.
- Transporte Juspilot (`token` + webhook/events), admin create/delete users, envio de texto por conta, webhook dual Evolution/WuzAPI, UI de instância/QR, import de nomes/avatars, blacklist com mirror WuzAPI.

### Por que

- Substituir Evolution no caminho operacional com controle das instâncias no WuzAPI próprio, mantendo chat em tempo real via SSE.

### Onde revisar

- `src/domain/whatsapp/wuzapi-*.ts`, `resolve-transport.ts`, `src/app/api/whatsapp/{config,session,webhook,sync}`, `src/components/settings/whatsapp-config.tsx`, migration `blocked_at`.

### Impacto

- [x] Frontend
- [x] Backend
- [x] DB
- [ ] Deploy
- [x] DX

### Risco / Atenção

- Rodar migrations `20261105*` e `20261106000000_contact_blocked_at` no banco.
- Mídia via WuzAPI no send ainda retorna unsupported; áudio Opus e HMAC inbound ficam para ciclo seguinte.
- Validar ponta a ponta contra a instância Juspilot real (`WUZAPI_ADMIN_TOKEN`).

### Como validar

- `pnpm exec vitest run src/domain/whatsapp/wuzapi-api.test.ts src/domain/whatsapp/wuzapi-admin.test.ts src/app/api/whatsapp/webhook/route.test.ts src/domain/whatsapp/blacklist.test.ts`
- Criar instância no painel, escanear QR, enviar/receber texto, importar contatos, blacklist.

---

## 2026-11-05 — Decisão e operação da migração WuzAPI

### O que foi feito

- ADR-007 decide WuzAPI por conta, SSE retomável e trabalho persistente no Postgres; ADR-006 recebe adendo preservando o histórico.
- Runbook, deploy e exemplo de ambiente registram callback, validação e rollback por conta. O modelo Prisma da tarefa t2 adiciona provedor, sessão e credencial criptografada; migrations ainda precisam ser validadas em uma cópia do banco.

### Risco / atenção

- O adaptador toma como referência upstream WuzAPI `4f4838c8586e341b1f67850bd77d7828a72e6d04`. A especificação Juspilot declara `info.version` 3.0.0 e difere do adaptador no header de token e no corpo de registro do webhook; reconciliar e validar antes da liberação. A versão efetivamente implantada e a autenticação inbound ainda não foram comprovadas. A arquitetura alvo não comprova que os demais componentes estejam implantados.
- Índices concorrentes da migração t2 exigem execução sem transação explícita; consultar `prisma/migrations/20261105000000_whatsapp_provider_per_account/VALIDATION.md` e validar a sequência antes do deploy.

### Como validar

- Conferir a matriz de aceite, o callback externo autenticado, retomada SSE, reinício e rollback por conta no ambiente implantado. Ver [runbook](./runbook-local.md).

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
- Prisma na raiz; removeu `@zapp/database`, stubs Supabase, `packages/shared`, MCP opcional, docs legadas
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
- Persistiu no redeploy (Dokploy em build type Nixpacks repassa envs ao build). `package.json` agora força `NODE_ENV=production` em `build` e `start`; validado com `NODE_ENV=development pnpm run build` → 77/77.
