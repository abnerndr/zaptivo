# Automações com template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Escolher um template, escolher contatos (a lista pode ser filtrada pelo `type`) e disparar agora ou numa data. Não dispara para a base inteira.

**Architecture:** Tabelas novas `TemplateDispatch` e `TemplateDispatchRecipient`. O motor antigo `runAutomationsForTrigger` continua retornando `{ ran: 0 }` e não é ligado. O envio usa `sendMessageToConversation` com `messageType: 'template'`. Imediato roda no POST. Agendado fica `scheduled` até `POST /api/template-dispatches/cron`, autorizado por `AUTOMATION_CRON_SECRET` (o mesmo header do cron de flows).

**Tech Stack:** Prisma, `sendMessageToConversation`, Vitest, página `/automations`.

## Global Constraints

- Um app Next.js na raiz. Domínio em `src/domain`. Sem segundo serviço (ADR 004). O cron é uma rota no mesmo host, não um worker novo.
- Sem árvore de steps. Não gravar `AutomationStep`. Não reativar `/api/automations/engine` nem `/api/automations/cron` como motor genérico.
- O conjunto enviado é a lista explícita de `contactIds`. Filtro por `typeId` só reduz quem pode ser marcado. Contato fora de `contactIds` não recebe mensagem.
- `runAt` no passado ou ausente significa imediato (`status: 'queued'` e o POST processa na hora). `runAt` no futuro grava `status: 'scheduled'` e não envia no POST.
- Template tem de existir na conta e estar com `status: 'ACTIVE'`. Senão `400` `{ error: 'Template inválido' }`.
- Cada destinatário vira uma linha. Falha num contato não cancela os outros: `status` do destinatário `sent` ou `failed`, `errorMessage` preenchido na falha.
- Subir `PRISMA_SCHEMA_VERSION` de `5` para `6`. Se ainda não estiver em `5`, executar o plano 4 antes.
- Rotas antigas `/automations/new` e `/automations/[id]/edit` continuam no ar. A página índice `/automations` passa a ser este disparo.

---

### Task 1: Escolha dos contatos e do horário

**Files:**
- Create: `src/domain/template-dispatches/select.ts`
- Test: `src/domain/template-dispatches/select.test.ts`

**Interfaces:**
- Produces:
  - `selectContactIds(args: { contacts: Array<{ id: string; typeId: string | null }>; selectedIds: string[]; typeId: string | null }): string[]`
  - `dispatchTiming(runAt: string | null, now: Date): { status: 'queued' | 'scheduled'; runAt: Date }`

`selectContactIds`: interseção de `selectedIds` com `contacts`, preservando a ordem de `selectedIds`. Se `typeId` não é null, descarta quem tem outro `typeId` ou null. Não acrescenta contatos que não foram marcados.

`dispatchTiming`: `runAt` null, `''` ou data inválida ou `<= now` → `{ status: 'queued', runAt: now }`. Data futura → `{ status: 'scheduled', runAt: essa data }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { dispatchTiming, selectContactIds } from './select'

const contacts = [
  { id: 'a', typeId: 'lead' },
  { id: 'b', typeId: 'cliente' },
  { id: 'c', typeId: null },
]

describe('selectContactIds', () => {
  it('returns only checked contacts, in the checked order', () => {
    expect(
      selectContactIds({
        contacts,
        selectedIds: ['c', 'a', 'missing'],
        typeId: null,
      }),
    ).toEqual(['c', 'a'])
  })

  it('drops checked contacts that do not match the type filter', () => {
    expect(
      selectContactIds({
        contacts,
        selectedIds: ['a', 'b', 'c'],
        typeId: 'lead',
      }),
    ).toEqual(['a'])
  })

  it('does not expand a type into the whole base', () => {
    expect(
      selectContactIds({
        contacts,
        selectedIds: [],
        typeId: 'lead',
      }),
    ).toEqual([])
  })
})

describe('dispatchTiming', () => {
  const now = new Date('2026-10-10T18:00:00.000Z')

  it('queues when runAt is missing or not in the future', () => {
    expect(dispatchTiming(null, now).status).toBe('queued')
    expect(dispatchTiming('2026-10-10T17:00:00.000Z', now).status).toBe('queued')
    expect(dispatchTiming('not-a-date', now).status).toBe('queued')
  })

  it('schedules a future instant', () => {
    const result = dispatchTiming('2026-10-11T12:00:00.000Z', now)
    expect(result.status).toBe('scheduled')
    expect(result.runAt.toISOString()).toBe('2026-10-11T12:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/template-dispatches/select.test.ts`

Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

Implementar as duas funções sem Prisma.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/template-dispatches/select.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/template-dispatches/select.ts src/domain/template-dispatches/select.test.ts
git commit -m "feat: select explicit contacts and a dispatch time"
```

---

### Task 2: Schema do disparo

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/domain/db/prisma.ts`

**Interfaces:**
- Produces: `TemplateDispatch`, `TemplateDispatchRecipient`

- [ ] **Step 1: Write the failing test**

`src/domain/template-dispatches/schema.test.ts` lê `prisma/schema.prisma` e exige `model TemplateDispatch`, `model TemplateDispatchRecipient`, `@map("template_dispatches")`, `@map("template_dispatch_recipients")`, `runAt`, `templateId`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/template-dispatches/schema.test.ts`

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

No `Tenant`:

```prisma
  templateDispatches    TemplateDispatch[]
```

```prisma
model TemplateDispatch {
  id         String   @id @default(uuid()) @db.Uuid
  accountId  String   @map("account_id") @db.Uuid
  templateId String   @map("template_id") @db.Uuid
  status     String   @default("queued") // queued | scheduled | sending | sent | failed
  runAt      DateTime @map("run_at")
  createdAt  DateTime @default(now()) @map("created_at")

  account    Tenant                       @relation(fields: [accountId], references: [id], onDelete: Cascade)
  template   MessageTemplate              @relation(fields: [templateId], references: [id], onDelete: Restrict)
  recipients TemplateDispatchRecipient[]

  @@index([status, runAt])
  @@map("template_dispatches")
}

model TemplateDispatchRecipient {
  id           String  @id @default(uuid()) @db.Uuid
  dispatchId   String  @map("dispatch_id") @db.Uuid
  contactId    String  @map("contact_id") @db.Uuid
  status       String  @default("pending") // pending | sent | failed
  errorMessage String? @map("error_message")

  dispatch TemplateDispatch @relation(fields: [dispatchId], references: [id], onDelete: Cascade)
  contact  Contact          @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@unique([dispatchId, contactId])
  @@map("template_dispatch_recipients")
}
```

Acrescentar os arrays inversos em `MessageTemplate` (`dispatches TemplateDispatch[]`) e em `Contact` (`templateDispatchRecipients TemplateDispatchRecipient[]`).

`PRISMA_SCHEMA_VERSION = 6`.

Run: `pnpm exec prisma migrate dev --name template_dispatch`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/template-dispatches/schema.test.ts src/domain/template-dispatches/select.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/domain/db/prisma.ts src/domain/template-dispatches/schema.test.ts
git commit -m "feat: store template dispatches and their recipients"
```

---

### Task 3: Executar o disparo e o cron

**Files:**
- Create: `src/domain/template-dispatches/run.ts`
- Create: `src/app/api/template-dispatches/route.ts`
- Create: `src/app/api/template-dispatches/cron/route.ts`
- Test: `src/domain/template-dispatches/due.test.ts`

**Interfaces:**
- Consumes: `dispatchTiming`, `selectContactIds`, `sendMessageToConversation`, `resolveConversation`
- Produces:
  - `isDue(status: string, runAt: Date, now: Date): boolean` — true quando status é `queued` ou `scheduled` e `runAt <= now`
  - `runDispatch(dispatchId: string): Promise<{ sent: number; failed: number }>`
  - `POST /api/template-dispatches` body `{ templateId: string; contactIds: string[]; typeId?: string | null; runAt?: string | null }`
  - `GET /api/template-dispatches` lista os disparos da conta com contagem de destinatários
  - `POST /api/template-dispatches/cron` header `x-cron-secret` ou `Authorization: Bearer` igual a `AUTOMATION_CRON_SECRET`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { isDue } from './due'

describe('isDue', () => {
  const now = new Date('2026-10-10T18:00:00.000Z')

  it('is due when queued or scheduled and runAt has arrived', () => {
    expect(isDue('queued', now, now)).toBe(true)
    expect(isDue('scheduled', new Date('2026-10-10T17:00:00.000Z'), now)).toBe(true)
  })

  it('is not due in the future or after it already finished', () => {
    expect(isDue('scheduled', new Date('2026-10-11T18:00:00.000Z'), now)).toBe(false)
    expect(isDue('sent', now, now)).toBe(false)
    expect(isDue('sending', now, now)).toBe(false)
  })
})
```

Colocar `isDue` em `src/domain/template-dispatches/due.ts` para o teste não puxar Prisma.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/template-dispatches/due.test.ts`

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`isDue` como acima.

`runDispatch`:

1. Carrega o dispatch com template (`name`, `language`, `bodyText`, `status`) e recipients `pending`, incluindo `contact.phone` e `contact.typeId`.
2. Se o template não está `ACTIVE`, marca o dispatch `failed` e cada pending `failed` com `errorMessage: 'Template inválido'`. Retorna `{ sent: 0, failed: n }`.
3. Marca o dispatch `sending`.
4. Para cada recipient: `resolveConversation({ accountId, phone: contact.phone, contactName: contact.name })`, depois `sendMessageToConversation(accountId, { conversationId, messageType: 'template', templateName: template.name, templateLanguage: template.language, contentText: template.bodyText })`.
5. Sucesso → recipient `sent`. `SendMessageError` ou outro erro → recipient `failed` e `errorMessage` com `err.message` truncado em 500 caracteres.
6. Se todos `sent`, dispatch `sent`. Se houve falha e nenhum sent, `failed`. Se misturou, `sent` (o detalhe fica nos recipients).

`POST /api/template-dispatches`:

- `requireSessionAccount`.
- Template da conta com status `ACTIVE`, senão 400 `'Template inválido'`.
- Carrega os contatos da conta cujo id está em `contactIds` (select `id`, `typeId`).
- `ids = selectContactIds({ contacts, selectedIds: contactIds, typeId: body.typeId ?? null })`.
- Se `ids.length === 0`, 400 `{ error: 'Nenhum contato selecionado' }`.
- `timing = dispatchTiming(body.runAt ?? null, new Date())`.
- Cria dispatch + recipients `pending`.
- Se `timing.status === 'queued'`, `await runDispatch(id)`.
- Resposta `201` `{ id, status, runAt }`.

Cron, copiando o `authorize` de `src/app/api/flows/cron/route.ts`:

```ts
export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const now = new Date()
  const due = await prisma.templateDispatch.findMany({
    where: {
      status: { in: ['queued', 'scheduled'] },
      runAt: { lte: now },
    },
    select: { id: true },
    take: 20,
  })
  let sent = 0
  let failed = 0
  for (const row of due) {
    const result = await runDispatch(row.id)
    sent += result.sent
    failed += result.failed
  }
  return NextResponse.json({ ok: true, dispatches: due.length, sent, failed })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/template-dispatches/due.test.ts src/domain/template-dispatches/select.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/template-dispatches src/app/api/template-dispatches
git commit -m "feat: send a template now or when the dispatch is due"
```

---

### Task 4: Página de disparo

**Files:**
- Modify: `src/app/(dashboard)/automations/page.tsx`

**Interfaces:**
- Consumes: `GET /api/message-templates`, que já devolve `{ templates: Array<{ id, name, language, status, body_text }> }` da conta. A página filtra `status === 'ACTIVE'`. Não criar outra rota de listagem.
- Consumes: `GET /api/contacts?typeId=` e `GET /api/contact-types` do plano 4.
- Produces: a página índice deixa de listar a árvore de automations e passa a montar o disparo.

- [ ] **Step 1: Write the failing test**

`src/app/(dashboard)/automations/page.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('automations page', () => {
  it('posts an explicit template dispatch', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/(dashboard)/automations/page.tsx'),
      'utf8',
    )
    expect(src).toContain('/api/template-dispatches')
    expect(src).toContain('contactIds')
    expect(src).not.toContain('TRIGGER_META')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/(dashboard)/automations/page.test.ts`

Expected: FAIL, a página ainda importa `TRIGGER_META`.

- [ ] **Step 3: Write minimal implementation**

Substituir o corpo da página por um client component:

- Select de templates ACTIVE.
- Select de tipo com opção “Todos os tipos” (`typeId` vazio). Ao mudar, recarrega `GET /api/contacts?typeId=`.
- Lista com checkbox. Botão “Marcar visíveis” marca só os ids da lista atual.
- `datetime-local` opcional. Vazio = agora.
- Botão “Disparar” faz POST `{ templateId, contactIds: [...checked], typeId: typeId || null, runAt: runAt || null }`.
- Abaixo, a lista de `GET /api/template-dispatches`: horário, status, quantos destinatários.

Não linkar para `/automations/new` nesta página.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/template-dispatches/select.test.ts src/domain/template-dispatches/due.test.ts src/app/(dashboard)/automations/page.test.ts`

Expected: PASS

No browser, em `/automations`: marcar dois contatos, disparar um template ACTIVE, ver as bolhas nas conversas. Agendar um terceiro para daqui a um minuto e confirmar que o POST não envia antes do cron.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/automations/page.tsx src/app/\(dashboard\)/automations/page.test.ts
git commit -m "feat: dispatch a template to the contacts that were checked"
```
