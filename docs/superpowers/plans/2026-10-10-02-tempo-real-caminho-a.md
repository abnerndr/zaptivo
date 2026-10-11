# Tempo real — caminho A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mensagem que já está no banco aparece na conversa aberta e sobe na lista, sem sincronizar e sem refazer a listagem da conta.

**Architecture:** O ingest grava e faz `pg_notify` assim que a conversa é conhecida, usando só o banco (telefone exato ou LID já guardado). A resolução WAHA do `@lid` e o avatar rodam depois, sem segurar o notify. O SSE carrega a bolha. O cliente faz append. A busca completa fica para abrir a conversa e para reconectar. O `LISTEN` exige URL de sessão.

**Tech Stack:** Next.js 16, `pg` Client, EventSource, TanStack Query, Vitest.

## Global Constraints

- Um app Next.js na raiz. Domínio em `src/domain`. Sem segundo serviço (ADR 004). Sem WebSocket no navegador. O transporte aba continua SSE em `GET /api/realtime/stream`.
- Não chamar `resolveToPhoneNumber` antes do `notifyAccount` da mensagem nova.
- O evento de insert carrega: `table: 'messages'`, `op: 'INSERT'`, `id`, `accountId`, `conversationId`, `contactId`, `text`, `direction` (`'in' | 'out'`), `contentType`, `mediaUrl` (pode ser null), `status`, `createdAt` (ISO).
- Se a identidade resolvida depois mover a mensagem de conversa, um segundo notify usa `op: 'UPDATE'`, `movedFromConversationId` e `movedToConversationId`.
- `useInboxRealtime` não invalida `inboxKeys.all` ao receber insert ou update com esses campos. Invalida a lista de conversas só quando o `conversationId` não está no cache. Invalida o inbox inteiro só no reconnect do SSE (não no primeiro `onopen`).
- `useSendMessage` não invalida inbox no `onSettled`. A confirmação é o `onSuccess` que já troca o id temporário.
- `LISTEN` usa `DIRECT_DATABASE_URL` se existir, senão `DATABASE_URL`. Recusa URL com `pgbouncer=true` ou porta `6543`.
- Não remover `dispatchInboundToFlows` neste plano. Isso é o plano 6.
- Não desenhar mídia neste plano. `mediaUrl` só viaja no payload.
- `PRISMA_SCHEMA_VERSION` permanece `4` (o plano 1 já subiu de 3 para 4).

---

### Task 1: URL de LISTEN em modo sessão

**Files:**
- Create: `src/domain/db/listen-url.ts`
- Test: `src/domain/db/listen-url.test.ts`
- Modify: `src/app/api/realtime/stream/route.ts`

**Interfaces:**
- Consumes: `process.env.DIRECT_DATABASE_URL`, `process.env.DATABASE_URL`
- Produces: `listenConnectionString(env: { DIRECT_DATABASE_URL?: string; DATABASE_URL?: string }): string` — lança `Error` com a mensagem exata `LISTEN requires a session-mode Postgres URL. Set DIRECT_DATABASE_URL.` quando a URL escolhida contém `pgbouncer=true` (case insensitive) ou a porta `6543`.

- [ ] **Step 1: Write the failing test**

Criar `src/domain/db/listen-url.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { listenConnectionString } from './listen-url'

const session = 'postgresql://u:p@db.example:5432/zaptivo'
const pooled = 'postgresql://u:p@db.example:6543/zaptivo?pgbouncer=true'

describe('listenConnectionString', () => {
  it('prefers DIRECT_DATABASE_URL', () => {
    expect(
      listenConnectionString({
        DIRECT_DATABASE_URL: session,
        DATABASE_URL: pooled,
      }),
    ).toBe(session)
  })

  it('uses DATABASE_URL when it is already a session url', () => {
    expect(listenConnectionString({ DATABASE_URL: session })).toBe(session)
  })

  it('rejects a transaction pooler', () => {
    expect(() => listenConnectionString({ DATABASE_URL: pooled })).toThrow(
      'LISTEN requires a session-mode Postgres URL. Set DIRECT_DATABASE_URL.',
    )
  })

  it('rejects a missing url', () => {
    expect(() => listenConnectionString({})).toThrow('DATABASE_URL is not set')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/db/listen-url.test.ts`

Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

`src/domain/db/listen-url.ts`:

```ts
const POOLER = /pgbouncer=true|:6543(\/|\?|$)/i

export function listenConnectionString(env: {
  DIRECT_DATABASE_URL?: string
  DATABASE_URL?: string
}): string {
  const url = env.DIRECT_DATABASE_URL || env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  if (POOLER.test(url)) {
    throw new Error(
      'LISTEN requires a session-mode Postgres URL. Set DIRECT_DATABASE_URL.',
    )
  }
  return url
}
```

Em `src/app/api/realtime/stream/route.ts`, trocar a leitura de `process.env.DATABASE_URL` por:

```ts
import { listenConnectionString } from '@/domain/db/listen-url'

let connectionString: string
try {
  connectionString = listenConnectionString(process.env)
} catch (err) {
  const message = err instanceof Error ? err.message : 'DATABASE_URL missing'
  return new Response(message, { status: 500 })
}
const client = new Client({ connectionString })
```

`pg_notify` continua em `getPgPool()` (`DATABASE_URL`). As duas URLs têm de ser o mesmo Postgres; a direta é a de sessão.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/db/listen-url.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/db/listen-url.ts src/domain/db/listen-url.test.ts src/app/api/realtime/stream/route.ts
git commit -m "fix: require a session Postgres URL for LISTEN"
```

---

### Task 2: Payload da bolha e notify antes do WAHA

**Files:**
- Create: `src/domain/realtime/payload.ts`
- Modify: `src/domain/db/notify.ts`
- Modify: `src/hooks/use-realtime.ts`
- Modify: `src/domain/whatsapp/inbound.ts`
- Test: `src/domain/realtime/payload.test.ts`

**Interfaces:**
- Consumes: `notifyAccount`, `findContactByLid`, `resolveConversation`, `findExistingMessage`
- Produces: `messageInsertPayload(args: { id: string; accountId: string; conversationId: string; contactId: string; text: string | null; fromMe: boolean; contentType: string; mediaUrl: string | null; status: string; createdAt: Date }): RealtimePayload`

`RealtimePayload`:

```ts
export type RealtimePayload = {
  type?: 'ping' | 'ready' | 'reconnect'
  table?: string
  op?: 'INSERT' | 'UPDATE' | 'DELETE'
  id?: string
  accountId?: string
  conversationId?: string
  contactId?: string
  text?: string | null
  direction?: 'in' | 'out'
  contentType?: string
  mediaUrl?: string | null
  status?: string
  createdAt?: string
  movedFromConversationId?: string
  movedToConversationId?: string
}
```

- [ ] **Step 1: Write the failing test**

`src/domain/realtime/payload.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { messageInsertPayload } from './payload'

describe('messageInsertPayload', () => {
  it('carries the fields the open thread needs to append a bubble', () => {
    const createdAt = new Date('2026-10-10T18:00:00.000Z')
    expect(
      messageInsertPayload({
        id: 'msg-1',
        accountId: 'acc-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        text: 'oi',
        fromMe: false,
        contentType: 'text',
        mediaUrl: null,
        status: 'delivered',
        createdAt,
      }),
    ).toEqual({
      table: 'messages',
      op: 'INSERT',
      id: 'msg-1',
      accountId: 'acc-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      text: 'oi',
      direction: 'in',
      contentType: 'text',
      mediaUrl: null,
      status: 'delivered',
      createdAt: '2026-10-10T18:00:00.000Z',
    })
  })

  it('marks outgoing messages as out', () => {
    const payload = messageInsertPayload({
      id: 'msg-2',
      accountId: 'acc-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      text: 'olá',
      fromMe: true,
      contentType: 'text',
      mediaUrl: null,
      status: 'sent',
      createdAt: new Date('2026-10-10T18:00:01.000Z'),
    })
    expect(payload.direction).toBe('out')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/realtime/payload.test.ts`

Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

`src/domain/realtime/payload.ts` exporta o type acima e:

```ts
export function messageInsertPayload(args: {
  id: string
  accountId: string
  conversationId: string
  contactId: string
  text: string | null
  fromMe: boolean
  contentType: string
  mediaUrl: string | null
  status: string
  createdAt: Date
}): RealtimePayload {
  return {
    table: 'messages',
    op: 'INSERT',
    id: args.id,
    accountId: args.accountId,
    conversationId: args.conversationId,
    contactId: args.contactId,
    text: args.text,
    direction: args.fromMe ? 'out' : 'in',
    contentType: args.contentType,
    mediaUrl: args.mediaUrl,
    status: args.status,
    createdAt: args.createdAt.toISOString(),
  }
}
```

`src/domain/db/notify.ts`: `RealtimePayload` passa a ser importado de `@/domain/realtime/payload`. `notifyAccount` continua exigindo `table`, `op`, `id`, `accountId` e serializa o objeto inteiro (campos extras inclusos).

`src/hooks/use-realtime.ts`: apagar o type local e importar `RealtimePayload` de `@/domain/realtime/payload`. No `onopen`, se já houve um open anterior nesta montagem, chamar `handlerRef.current({ type: 'reconnect' })` antes de marcar connected. O primeiro open não dispara reconnect.

Em `ingestWahaMessage`, **remover** os dois blocos que chamam `resolveToPhoneNumber` antes do insert (o bloco que começa em “Resolve WhatsApp Linked ID” e o bloco “Fold LID stubs”). No lugar, só cache local:

```ts
const lidJid = pickLidJid(payload) || (jid.includes('@lid') ? jid : null)
if (lidJid || jid.includes('@lid') || isLikelyLid(phone)) {
  const byLid = await findContactByLid({
    accountId,
    lid: lidJid || phone,
  })
  if (byLid && isLikelyPhoneNumber(byLid.phone)) {
    phone = sanitizePhoneForMeta(byLid.phone)
  }
}
```

Depois do `message.create` e do update da conversa, o primeiro notify passa a ser:

```ts
await notifyAccount(
  messageInsertPayload({
    id: message.id,
    accountId,
    conversationId,
    contactId,
    text,
    fromMe,
    contentType,
    mediaUrl: payload.media?.url ?? null,
    status: message.status,
    createdAt,
  }),
).catch(() => {})
```

Manter o segundo notify de `conversations` / `UPDATE` com `id: conversationId`.

Em seguida, sem await:

```ts
void settleContactIdentity({
  accountId,
  session,
  contactId,
  conversationId,
  messageId: message.id,
  phone,
  pushName,
  lidJid,
  jid,
}).catch((err) => console.warn('[settleContactIdentity]', err))
```

`settleContactIdentity` mora no mesmo arquivo. Ela faz o que os blocos removidos faziam: `resolveToPhoneNumber`, `upgradeContactToPhone`, `rememberContactLid`, `ensureContactAvatar`. Se `upgradeContactToPhone` devolver um `contactId` diferente, reler a mensagem. Se `conversationId` mudou, `notifyAccount` com:

```ts
{
  table: 'messages',
  op: 'UPDATE',
  id: messageId,
  accountId,
  conversationId: movedTo,
  movedFromConversationId: conversationIdOriginal,
  movedToConversationId: movedTo,
}
```

Não chamar `resolveToPhoneNumber` quando `session` está vazio. `dispatchInboundToFlows` continua depois do notify, ainda em `void`, só quando `!fromMe && text?.trim()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/realtime/payload.test.ts src/domain/whatsapp/phone-utils.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/realtime/payload.ts src/domain/realtime/payload.test.ts src/domain/db/notify.ts src/hooks/use-realtime.ts src/domain/whatsapp/inbound.ts
git commit -m "fix: notify the inbox as soon as the message row exists"
```

---

### Task 3: A conversa aberta faz append

**Files:**
- Create: `src/hooks/inbox/apply-realtime.ts`
- Test: `src/hooks/inbox/apply-realtime.test.ts`
- Modify: `src/hooks/inbox/types.ts` (`InboxMessage.media_url?: string | null`)
- Modify: `src/hooks/inbox/use-inbox-queries.ts`
- Modify: `src/app/(dashboard)/inbox/page.tsx`

**Interfaces:**
- Consumes: `RealtimePayload`, `InboxMessage`, `InboxConversation`
- Produces:
  - `applyMessageInsert(messages: InboxMessage[] | undefined, event: RealtimePayload): InboxMessage[]`
  - `applyConversationPreview(list: InboxConversation[] | undefined, event: RealtimePayload): { list: InboxConversation[]; known: boolean }`
  - `applyMessageMove(messages: InboxMessage[] | undefined, event: RealtimePayload, conversationId: string): InboxMessage[]`

- [ ] **Step 1: Write the failing test**

`src/hooks/inbox/apply-realtime.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  applyConversationPreview,
  applyMessageInsert,
  applyMessageMove,
} from './apply-realtime'
import type { InboxConversation, InboxMessage } from './types'

const event = {
  table: 'messages' as const,
  op: 'INSERT' as const,
  id: 'msg-1',
  accountId: 'acc',
  conversationId: 'conv-1',
  text: 'oi',
  direction: 'in' as const,
  contentType: 'text',
  mediaUrl: null,
  status: 'delivered',
  createdAt: '2026-10-10T18:00:00.000Z',
}

describe('applyMessageInsert', () => {
  it('appends a bubble once', () => {
    const first = applyMessageInsert(undefined, event)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({
      id: 'msg-1',
      sender_type: 'customer',
      content_text: 'oi',
      content_type: 'text',
      status: 'delivered',
      created_at: '2026-10-10T18:00:00.000Z',
    })
    expect(applyMessageInsert(first, event)).toHaveLength(1)
  })
})

describe('applyConversationPreview', () => {
  const list: InboxConversation[] = [
    {
      id: 'conv-2',
      last_message_text: 'antiga',
      last_message_at: '2026-10-10T17:00:00.000Z',
      unread_count: 0,
      contact: null,
    },
    {
      id: 'conv-1',
      last_message_text: 'antes',
      last_message_at: '2026-10-10T16:00:00.000Z',
      unread_count: 1,
      contact: null,
    },
  ]

  it('moves the known conversation to the top and bumps unread on inbound', () => {
    const result = applyConversationPreview(list, event)
    expect(result.known).toBe(true)
    expect(result.list[0]).toMatchObject({
      id: 'conv-1',
      last_message_text: 'oi',
      unread_count: 2,
    })
  })

  it('reports unknown conversations so the caller can refetch the list', () => {
    const result = applyConversationPreview(list, {
      ...event,
      conversationId: 'conv-new',
    })
    expect(result.known).toBe(false)
    expect(result.list.map((c) => c.id)).toEqual(['conv-2', 'conv-1'])
  })
})

describe('applyMessageMove', () => {
  const messages: InboxMessage[] = [
    {
      id: 'msg-1',
      sender_type: 'customer',
      content_text: 'oi',
      content_type: 'text',
      status: 'delivered',
      created_at: '2026-10-10T18:00:00.000Z',
    },
  ]

  it('removes the bubble from the old thread and appends it on the new one', () => {
    const move = {
      ...event,
      op: 'UPDATE' as const,
      movedFromConversationId: 'conv-1',
      movedToConversationId: 'conv-2',
    }
    expect(applyMessageMove(messages, move, 'conv-1')).toEqual([])
    expect(applyMessageMove([], move, 'conv-2')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/hooks/inbox/apply-realtime.test.ts`

Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

`src/hooks/inbox/apply-realtime.ts` implementa as três funções. `sender_type` é `'agent'` quando `direction === 'out'`, senão `'customer'`. Insert ignora evento sem `id` ou sem `conversationId` e devolve a lista como está. Preview com `direction === 'out'` não incrementa `unread_count`. Move sem os dois ids devolve a lista intacta.

`InboxMessage` ganha `media_url?: string | null`. O append grava `media_url: event.mediaUrl ?? null`.

`useInboxRealtime` passa a aceitar `onConversationMoved?: (from: string, to: string) => void`. No handler:

- `type === 'reconnect'` → `invalidateQueries({ queryKey: inboxKeys.all })`
- `op === 'INSERT'` e `table === 'messages'` e há `conversationId` → `setQueryData` de `inboxKeys.messages(conversationId)` com `applyMessageInsert`; `setQueryData` de conversations com `applyConversationPreview`; se `known === false`, `invalidateQueries({ queryKey: inboxKeys.conversations() })`
- `op === 'UPDATE'` com `movedFromConversationId` e `movedToConversationId` → aplicar `applyMessageMove` nos dois caches e chamar `onConversationMoved`

Não chamar `invalidateQueries({ queryKey: inboxKeys.all })` nesses ramos.

Em `inbox/page.tsx`, passar:

```ts
useInboxRealtime(accountId, {
  onConversationMoved: (from, to) => {
    setSelected((current) => (current === from ? to : current))
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/hooks/inbox/apply-realtime.test.ts src/domain/realtime/payload.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/inbox/apply-realtime.ts src/hooks/inbox/apply-realtime.test.ts src/hooks/inbox/types.ts src/hooks/inbox/use-inbox-queries.ts src/app/\(dashboard\)/inbox/page.tsx
git commit -m "fix: append live messages instead of refetching the inbox"
```

---

### Task 4: Envio confirma sem refazer a lista

**Files:**
- Modify: `src/hooks/inbox/use-inbox-mutations.ts`
- Test: `src/hooks/inbox/use-send-message-cache.test.ts` (a função pura extraída)

**Interfaces:**
- Consumes: `InboxMessage`
- Produces: `confirmOptimisticMessage(list: InboxMessage[] | undefined, tempId: string, confirmed: { id: string; contentText: string | null; contentType: string; status: string; createdAt: string }): InboxMessage[] | undefined`

- [ ] **Step 1: Write the failing test**

`src/hooks/inbox/use-send-message-cache.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { confirmOptimisticMessage } from './use-send-message-cache'
import type { InboxMessage } from './types'

const list: InboxMessage[] = [
  {
    id: 'temp-1',
    sender_type: 'agent',
    content_text: 'oi',
    content_type: 'text',
    status: 'sending',
    created_at: '2026-10-10T18:00:00.000Z',
  },
]

describe('confirmOptimisticMessage', () => {
  it('replaces the temporary bubble with the server id', () => {
    const next = confirmOptimisticMessage(list, 'temp-1', {
      id: 'msg-9',
      contentText: 'oi',
      contentType: 'text',
      status: 'sent',
      createdAt: '2026-10-10T18:00:01.000Z',
    })
    expect(next?.[0]).toMatchObject({
      id: 'msg-9',
      status: 'sent',
      sender_type: 'agent',
    })
  })
})
```

E um teste de fonte em `src/hooks/inbox/use-inbox-mutations.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('useSendMessage', () => {
  it('does not invalidate the inbox when the send settles', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/hooks/inbox/use-inbox-mutations.ts'),
      'utf8',
    )
    const send = src.slice(src.indexOf('export function useSendMessage'))
    const settled = send.slice(send.indexOf('onSettled'))
    expect(settled.includes('invalidateQueries')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/hooks/inbox/use-send-message-cache.test.ts src/hooks/inbox/use-inbox-mutations.test.ts`

Expected: FAIL. O segundo falha porque `onSettled` hoje invalida messages e conversations.

- [ ] **Step 3: Write minimal implementation**

Criar `src/hooks/inbox/use-send-message-cache.ts` com `confirmOptimisticMessage` mapeando o item cujo `id === tempId` para o id, texto, tipo, status e `created_at` confirmados, preservando `sender_type: 'agent'`.

Em `useSendMessage`, `onSuccess` chama essa função. Apagar o corpo de `onSettled` (ou remover `onSettled`). `useSyncWhatsapp` e `useMarkConversationRead` continuam invalidando como hoje.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/hooks/inbox/use-send-message-cache.test.ts src/hooks/inbox/use-inbox-mutations.test.ts src/hooks/inbox/apply-realtime.test.ts src/domain/db/listen-url.test.ts src/domain/realtime/payload.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/inbox/use-send-message-cache.ts src/hooks/inbox/use-send-message-cache.test.ts src/hooks/inbox/use-inbox-mutations.ts src/hooks/inbox/use-inbox-mutations.test.ts
git commit -m "fix: confirm a sent message without refetching the inbox"
```
