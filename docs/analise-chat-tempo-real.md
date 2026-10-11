# Análise — chat em tempo real, contatos e recorte do produto

Data: 2026-10-10  
Status: diagnóstico fechado. Decisões cravadas em 2026-10-10. Nenhum código de produto foi alterado.  
Próximo passo: executar os planos em `docs/superpowers/plans/2026-10-10-00-indice.md`, na ordem 1 → 7.

## O que esta leitura cobre

O pedido foi diagnosticar o Zaptivo antes de mexer, com prioridade no chat: tempo de resposta ruim, mensagem que não aparece na hora, e “salvar contato” que não grava sempre. Em seguida, reduzir o produto para chat, contatos e automações com templates em contatos escolhidos, e criar no contato uma categoria `type` (quem é o lead), cadastrável no painel.

Arquitetura vigente (ADRs 001–004, aceitos): um app Next.js na raiz, domínio em `src/domain`, Prisma na raiz, um serviço no Dokploy. Qualquer canal ao vivo com o WhatsApp precisa morar nesse processo. Um segundo serviço só para eventos contradiz o ADR 004.

## Como o chat funciona hoje

Há dois caminhos. O ao vivo depende do primeiro. O segundo é manual e pesado.

```
WhatsApp
  → WAHA
  → POST /api/whatsapp/webhook          (message, message.any, message.ack, session.status)
  → ingestWahaMessage / ingestWahaAck   (src/domain/whatsapp/inbound.ts, ack.ts)
  → grava Contact + Conversation + Message
  → pg_notify no canal account_<id>     (src/domain/db/notify.ts)
  → GET /api/realtime/stream            (LISTEN nesse canal, SSE)
  → useRealtime → useInboxRealtime
  → invalidateQueries de TODO o inbox
  → GET /api/inbox/conversations + GET /api/inbox/messages
  → a tela redesenha
```

O fallback, quando o webhook não chega:

```
botão “Sincronizar WhatsApp” ou foco da aba (só se o SSE estiver caído)
  → POST /api/whatsapp/sync
  → lista chats e mensagens na API do WAHA
  → passa cada mensagem pelo mesmo ingest
```

O navegador já usa SSE (`EventSource` em `src/hooks/use-realtime.ts`). Não existe WebSocket no código do Zaptivo. O webhook é só a perna WAHA → servidor. O SSE é a perna servidor → aba.

Eventos que o WAHA está configurado para enviar (`src/domain/whatsapp/waha-api.ts`): `session.status`, `message`, `message.any`, `message.ack`. A URL do webhook é `WAHA_WEBHOOK_URL` ou `NEXT_PUBLIC_SITE_URL` + `/api/whatsapp/webhook`. Se essa URL for localhost, o cliente do WAHA recusa registrar o webhook e o chat só atualiza no sync manual. A própria inbox avisa isso quando a lista está vazia.

## Por que a mensagem demora e às vezes não aparece

O atraso não é “falta de SSE”. O SSE existe e, quando o `pg_notify` dispara, o cliente só invalida o cache e busca a lista inteira de novo. O tempo que o usuário sente é a soma destas etapas.

### 1. O evento do WhatsApp pode nem entrar

O ingest só roda se o WAHA conseguir fazer POST no Next. Sem URL pública (túnel ou domínio do Dokploy), a sessão fica sem webhook. Aí a mensagem só entra quando alguém clica em Sincronizar, ou quando a aba ganha foco e o SSE está marcado como desconectado.

O sync completo puxa até 40 chats e 30 mensagens por chat, resolve LID e deduplica a conta. Isso é um backfill, não um tempo real.

### 2. Antes de avisar a tela, o ingest faz trabalho demais

`ingestWahaMessage` (`src/domain/whatsapp/inbound.ts`), para cada mensagem, em sequência:

- escolhe o JID e descarta grupo/status
- chama o WAHA para resolver `@lid` → telefone (`resolveToPhoneNumber`)
- procura contato por LID, por prefixo de telefone e por push name
- cria ou funde conversa (`resolveConversation`)
- pode fundir de novo e apagar o contato-stub
- só então insere a mensagem e chama `notifyAccount` duas vezes (mensagem e conversa)

O `notify` sai depois dessa cadeia. Se a chamada ao WAHA para resolver o LID travar, a bolha só nasce quando ela termina. O cliente não recebe o texto no evento: recebe `{ table, op, id, accountId }` e precisa ir buscar de novo.

### 3. A busca que o SSE dispara é pesada

`useInboxRealtime` invalida a chave `['inbox']` inteira. Cada mensagem nova refaz conversas e mensagens.

`GET /api/inbox/conversations` não é uma listagem. A cada 60 segundos por conta ele roda `dedupeAccountInbox`: carrega todos os contatos e compara telefone com telefone (`phonesMatch`). No meio do intervalo, ainda percorre as conversas abertas e funde as duplicadas. Isso está no caminho quente do “chegou mensagem”.

`GET /api/inbox/messages` lê até 400 mensagens da conversa e deduplica em memória.

Enviar também fica lento por causa disso. `useSendMessage` desenha a bolha na hora (otimista) e, no `onSettled`, invalida o inbox inteiro. A confirmação espera essa listagem pesada.

### 4. LISTEN/NOTIFY pode estar mudo mesmo com o SSE “conectado”

`/api/realtime/stream` abre um `pg.Client` dedicado e faz `LISTEN`. O ping de 15s é gerado pelo Next, não pelo Postgres. A aba pode mostrar stream aberto e mesmo assim não receber mensagem.

`LISTEN` exige conexão de sessão. Se `DATABASE_URL` passar por pooler em modo transação (PgBouncer / pooler do Neon), o `LISTEN` não entrega notificações. O `pg_notify` do ingest usa o pool compartilhado do Prisma (`getPgPool`). Os dois precisam falar com o mesmo Postgres em modo sessão. Esta leitura não inspecionou o valor do `.env`.

### 5. O que o usuário vê no chat é uma tela reduzida

A página viva é `src/app/(dashboard)/inbox/page.tsx`: lista, bolha de texto, campo e botão Enviar. Vários componentes do inbox estão vazios de propósito (“em migração”): `message-thread`, `conversation-list`, `contact-sidebar`, `template-picker`. Mídia, resposta citada, reações e templates não passam por essa página. Reação na API responde `not_implemented`.

## Por que “salvar contato” não funciona sempre

O botão da inbox chama `PATCH /api/contacts/:id` só com `{ name }`. O número não é editável. O texto da UI fala em “agenda”, mas nada é gravado na agenda do WhatsApp: só a coluna `contacts.name`.

O nome se perde depois por causa da fusão de contatos, que roda no ingest e de novo na listagem.

- WhatsApp manda `@lid` (id interno) em vez do telefone. O sistema cria um contato-stub. O usuário salva o nome nesse stub. Quando o telefone real é resolvido, `upgradeContactToPhone` move a conversa para outro contato e apaga o stub. O nome do stub só é copiado se o contato destino estiver sem nome. Se o destino já tem o push name do WhatsApp, o nome que a pessoa digitou some.
- `phonesMatch` (`src/domain/whatsapp/phone-utils.ts`) trata como a mesma pessoa dois números cujos últimos 8 dígitos coincidem. No Brasil isso é o assinante sem DDD: números de cidades diferentes colidem. A dedupe então junta contatos que não são o mesmo lead, move conversas e pode apagar o registro em que o nome foi salvo.
- `findOrCreateContact` carrega até 500 contatos da conta e faz esse match frouxo em toda mensagem. Isso também aumenta a latência do ingest.
- Depois do PATCH, um refetch (SSE ou foco) devolve o contato que sobreviveu à fusão, muitas vezes sem o nome recém-salvo. A atualização otimista da inbox é substituída.

A página de Contatos (`/contacts`) lista e cria por telefone + nome via `/api/contacts`. O formulário rico, o detalhe e a importação estão em stub (`contact-form.tsx`, `contact-detail-view.tsx`, `import-modal.tsx`). Não existe campo de tipo do lead.

## Mapa do produto: o que responde e o que é casca

| Área | O que a tela promete | O que o código faz |
| --- | --- | --- |
| Inbox / chat | Conversar em tempo real | Webhook + SSE + sync manual. Texto funciona quando o evento entra. Tempo real é frágil e lento. |
| Contatos | Agenda do CRM | Lista e PATCH de nome/telefone/email/empresa funcionam. Fusão apaga ou troca o registro. UI rica em migração. |
| Tags | Etiqueta livre | Modelo `Tag` + `ContactTag` existe. A listagem devolve tags. Não é “quem é o lead”. |
| Automações | Disparar fluxos | CRUD grava `Automation` e steps. O motor `src/domain/automations/engine.ts` sempre retorna `{ ran: 0 }`. Cron e `/api/automations/engine` são casca. O builder avisa “em migração”. A página de logs diz que o motor não está ligado ao webhook. |
| Templates de mensagem | Enviar modelo | Modelo `MessageTemplate` e envio no `send-message` existem. O picker do inbox está em stub. |
| Flows | Fluxo visual | O motor em `src/domain/flows/engine.ts` ainda é chamado no inbound. A UI (`flow-builder`, canvas, editor) está em migração. |
| Broadcasts | Disparo em massa | Página lista `/api/broadcasts`. Os passos do wizard e `use-broadcast-sending` estão em migração. `POST /api/whatsapp/broadcast` é casca. |
| Pipelines | Funil | Página existe. `deal-form` e `pipeline-settings` estão em migração. |
| Agentes de IA | Resposta automática | Página e rotas de config existem. Fora do recorte pedido. |
| API pública `/api/v1/*` | Integração | Rotas shell, sem query de verdade. |
| Quick replies | Atalhos | Rotas shell. |
| Reações | Emoji na mensagem | API responde não implementado. |

A frase “nenhuma outra funcionalidade funciona direito” bate com a migração Nest → Next: muita UI e muita rota ficaram como casca. O chat é o único fluxo com caminho completo, e mesmo assim o caminho ao vivo está lento.

## Recorte pedido

Ficar só com:

1. **Chat** — uma conversa por contato, bolha aparecendo na hora em que a mensagem existe no banco, envio de texto com confirmação rápida.
2. **Contatos** — um registro estável por pessoa, nome que permanece, telefone real quando o WAHA resolver o LID.
3. **Automações com templates, nos contatos selecionados** — escolher um template, escolher contatos (e, quando existir, filtrar pelo `type`), disparar. Sem árvore de steps, sem webhook de automação, sem cron genérico, sem broadcast para a base inteira.
4. **`type` do contato** — categoria cadastrável no painel. Uma por contato. Responde “quem é esse lead” (cliente, fornecedor, lead frio, etc.). Não reaproveitar `Tag` para isso: tag é várias por contato e não tem esse significado.

Fora deste ciclo, esconder da navegação (sem apagar schema nesta leitura): pipelines, broadcasts, flows, agentes de IA. O motor de flows que ainda roda no inbound deve deixar de ser chamado nesse recorte, para uma mensagem nova não disparar um fluxo pela metade.

## `type` do contato (desenho para o próximo arquivo)

- Catálogo por conta, editável no painel: nome e cor.
- No contato, no máximo um tipo (`typeId` opcional).
- Dá para atribuir na ficha do contato e usar como filtro ao montar a audiência da automação.
- Trocar o tipo não mexe em telefone, conversa nem histórico.
- Tags atuais ficam de fora deste ciclo.

## Tempo real: três caminhos

O objetivo é o mesmo do WhatsApp: a mensagem que chegou aparece na conversa aberta e a lista sobe, sem clicar em Sincronizar e sem esperar uma varredura da conta.

### A — Consertar o cano que já existe (recomendado como base)

Manter o SSE do navegador em `/api/realtime/stream`. Mudar o que viaja nele e o que acontece antes.

- Gravar a mensagem e notificar assim que o id da conversa for conhecido. Resolver LID e avatar depois, sem segurar o `notify`.
- O evento SSE carrega o mínimo para desenhar a bolha (id da conversa, texto, direção, horário, status). A conversa aberta faz append. A lista atualiza `last_message` em memória. A busca completa fica para abrir a conversa e para reconectar.
- `GET /api/inbox/conversations` só lista. A fusão de contatos sai desse GET.
- `phonesMatch` deixa de usar “últimos 8 dígitos” como prova de que é a mesma pessoa. A chave estável passa a ser telefone normalizado e, quando houver, `whatsapp_lid`.
- Salvar contato grava o nome no contato que permanece depois da fusão, e o nome digitado pelo usuário não é substituído pelo push name.
- Confirmar que `DATABASE_URL` do `LISTEN` é conexão de sessão, a mesma instância que recebe o `pg_notify`.

O webhook continua válido quando a URL é pública. Ele já deduplica por id da mensagem.

### B — O servidor assina os eventos do WAHA (o que o pedido chama de SSE no CRM)

Isso substitui a dependência de o WAHA conseguir dar POST numa URL pública. O navegador continua no SSE do próprio Next. A chave do WAHA não vai para o browser.

O WAHA documenta webhook e WebSocket (`/ws?session=…&events=message`). Se a instância usada (crmwhatsapp) expuser um stream SSE de eventos, o Next segura esse stream. Se só houver WebSocket, o Next segura o WebSocket. Para o usuário o efeito é o mesmo: um consumidor longo dentro do processo único, com reconnect, gravando no mesmo `ingest` e no mesmo `notify`.

Não abrir um segundo serviço para isso (ADR 004). O consumidor sobe com o processo do Next (módulo único por sessão WAHA), não como rota que morre no fim do request.

Webhook e stream juntos só funcionam com a dedupe que já existe por `message_id`. Duplicar os dois sem essa chave duplica bolha.

### C — Polling curto

Já foi afastado no código (`inbox/page.tsx`: “Never poll in a loop”). Polling deixa o chat sempre atrasado e repete o GET pesado. Não é o caminho.

### Recomendação

Fazer A por completo. Sem A, trocar webhook por SSE/WebSocket do WAHA só muda quem entrega o evento; a tela continua esperando o ingest lento e o refetch da conta.

Acrescentar B se o webhook público for instável (local, túnel, Dokploy sem rota acessível pelo WAHA). Escolher SSE ou WebSocket conforme o que a instância do WAHA realmente oferece. Os dois são transporte servidor→WAHA. O transporte servidor→aba permanece SSE.

## O que o segundo markdown precisa cravar antes de executar

1. A instância do WAHA expõe stream SSE de eventos, ou só WebSocket e webhook?
2. O chat deste ciclo é só texto, ou mídia entra junto?
3. A automação dispara na hora, para os contatos marcados, ou também fica agendada?
4. `type` é obrigatório no contato ou pode ficar vazio?
5. Pipelines, broadcasts, flows e agentes saem só do menu, ou as rotas também ficam inacessíveis?

## Fora desta leitura

Nenhuma rota, schema, componente ou variável de ambiente foi alterada. Este arquivo é o diagnóstico para cruzar com o próximo markdown.
