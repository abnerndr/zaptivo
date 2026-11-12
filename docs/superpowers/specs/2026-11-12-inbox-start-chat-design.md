# Inbox — buscar contato e iniciar chat

Data: 2026-11-12
Status: revisada e aceita para implementação

## Problema

A coluna da Inbox só lista conversas já abertas. Não há como achar um contato salvo nem digitar um número e abrir um chat. O envio (`POST /api/whatsapp/send`) exige `conversation_id`, então um contato sem conversa não tem para onde mandar a primeira mensagem.

## Comportamento

Um campo de busca fica fixo no topo da coluna de conversas (a lista rola por baixo).

Com o campo vazio, a lista é a de hoje.

Com texto:

1. Conversas já carregadas cujo nome, telefone ou última mensagem contém o texto. Clique só seleciona a conversa.
2. Contatos salvos que não aparecem nessa lista. A busca remota reutiliza `GET /api/contacts?q=` (nome, telefone ou e-mail), com debounce de 300 ms, a partir de 2 caracteres. Clique abre ou cria a conversa e não envia WhatsApp.
3. Se o texto normalizado é um telefone válido e nenhum contato ou conversa carregada tem esse número exato, a última linha é `Iniciar conversa com {número formatado}`.

Ao escolher um contato ou um número novo:

- `POST /api/inbox/conversations` com `{ contactId }` ou `{ phone }`.
- Reusa a conversa daquele contato. Conversas fechadas reabrem. Não cria thread paralela.
- Se não existe conversa, cria uma vazia (`status: open`). Número novo cria o contato só com telefone, sem nome.
- Se o `id` já está na lista, só seleciona. Se não está, insere no topo. A busca limpa e o campo de mensagem recebe foco.
- Nenhuma mensagem sai até o usuário clicar em Enviar.
- O nome continua opcional. O botão Salvar contato / Renomear que já existe na conversa serve para nomear depois.

Contato com `blockedAt` não abre. A API responde 403 e a tela mostra o erro, sem trocar a conversa selecionada.

## Telefone novo

A linha de número novo só aparece quando o valor passa nas regras abaixo. ID interno do WhatsApp (LID) e texto que não é telefone não geram essa linha.

Normalização, nesta ordem:

1. Ficar só com os dígitos.
2. Se sobrarem 10 ou 11 dígitos, tratar como telefone brasileiro sem DDI e prefixar `55`. O usuário vê o número já formatado (`+55 …`) antes de clicar.
3. Aceitar só se `isLikelyPhoneNumber` for verdadeiro para esses dígitos. Essa função é a regra final: rejeita LID e o que não é telefone.

O valor gravado em `phone` e `phoneNormalized` é essa forma já normalizada.

## API

`POST /api/inbox/conversations`

- Sessão obrigatória, mesma conta.
- Permissão igual à de enviar mensagem (`canSendMessages` / `inbox.send`). Sem permissão: 403.
- Corpo: exatamente um de `contactId` (UUID da conta) ou `phone` (string). Os dois juntos, ou nenhum, é 400.
- `contactId` de outra conta ou inexistente: 404.
- Contato bloqueado: 403, mensagem `Contato na blacklist`. Não chama a criação.
- `phone` que falha na normalização acima: 400.
- Abertura em si usa `resolveConversation` já existente, passando o telefone normalizado e sem nome. Esse helper reaproveita a conversa aberta, reabre a fechada e cria contato/conversa quando falta.
- Resposta 200: o mesmo formato de item de `GET /api/inbox/conversations` (`id`, `status`, `unread_count`, `last_message_text`, `last_message_at`, `assigned_agent_id`, `contact`) mais `created: boolean`.

Não há endpoint novo de busca. A lista de contatos continua em `GET /api/contacts`.

## Interface

A lógica do que mostrar fica numa função pura, testável sem a página:

`buildInboxStartResults({ query, conversations, contacts })` →

- `conversations`: conversas locais que batem com o texto
- `contacts`: contatos da API cujo `id` não está em `conversations` (o conjunto já filtrado). Um contato achado por e-mail continua aparecendo quando a conversa local não bateu com o texto; o clique reabre a conversa existente
- `startPhone`: telefone normalizado para a linha de número novo, ou `null`

A página só renderiza esse resultado, dispara a busca e o POST, e trata foco, limpeza da busca e toast.

Estados:

- Busca de contatos em andamento: indicador pequeno no campo. A filtragem local não espera a rede.
- Resposta atrasada de uma busca antiga é ignorada.
- Falha da busca de contatos: toast, e a filtragem local continua.
- `conversations`, `contacts` e `startPhone` todos vazios: texto `Nenhum contato encontrado`. Se alguma conversa local bateu, essa frase não aparece.
- Falha do POST: toast com a mensagem da API. A lista e a seleção não mudam.

## Fora de escopo

- Enviar a primeira mensagem automaticamente.
- Pedir nome antes de abrir o chat.
- Busca dentro do histórico de mensagens.
- Alterar o botão Sincronizar ou o diálogo de salvar contato.

## Testes

Função pura `buildInboxStartResults`:

- Campo vazio devolve as conversas como vieram, sem contatos extras e sem `startPhone`.
- Filtra conversa por nome, telefone e última mensagem.
- Contato cujo `id` já está numa conversa filtrada não se repete. Contato achado só por e-mail aparece se a conversa local não bateu com o texto.
- `11999998888` vira `5511999998888` em `startPhone` quando não há match exato.
- Número já presente numa conversa ou num contato devolvido não gera `startPhone`.
- LID e texto comum deixam `startPhone` nulo.

Abertura (`openInboxConversation` no domínio, chamado pela rota):

- Contato bloqueado rejeita antes de `resolveConversation`.
- `contactId` de outra conta rejeita.
- Telefone inválido rejeita.
- Caminho feliz delega a `resolveConversation` com o telefone normalizado e sem nome.

## Como validar na tela

1. Inbox com várias conversas: o campo vazio não muda a lista.
2. Digitar o nome de um contato salvo que já tem conversa seleciona essa conversa.
3. Digitar um contato salvo sem conversa abre o fio vazio, com o cursor no campo de mensagem, e Enviar manda a primeira mensagem.
4. Digitar um celular brasileiro sem DDI mostra `Iniciar conversa com +55 …`, abre o fio e o contato aparece depois em Contatos, ainda sem nome.
5. Contato bloqueado mostra erro e não abre o fio.
