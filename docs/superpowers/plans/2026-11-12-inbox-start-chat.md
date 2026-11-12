# Inbox start chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No inbox, buscar um contato salvo ou digitar um número e abrir a conversa, sem enviar mensagem.

**Architecture:** Uma função pura decide o que a busca mostra. O `POST /api/inbox/conversations` reusa `resolveConversation` para achar ou criar a conversa vazia. A página da Inbox só renderiza esse resultado, chama a API e foca o compositor.

**Tech Stack:** Next.js 16 (App Router), Prisma, Vitest, React Query, Tailwind.

## Global Constraints

- Campo de busca fixo no topo da coluna de conversas; a lista rola por baixo.
- Campo vazio: a lista de conversas continua a de hoje.
- Busca remota reutiliza `GET /api/contacts?q=` (nome, telefone ou e-mail), debounce de 300 ms, a partir de 2 caracteres.
- `apiFetch` não encaminha `AbortSignal`. Resposta atrasada se ignora com um contador de geração, não com `abort`.
- Corpo do POST: exatamente um de `contactId` ou `phone`. Os dois juntos, ou nenhum, é 400.
- Permissão igual à de enviar mensagem (`canSendMessages` / `inbox.send`). `viewer` também recebe 403.
- Contato com `blockedAt`: 403 e mensagem `Contato na blacklist`. Não chama `resolveConversation`.
- Telefone digitado: só dígitos; 10 ou 11 dígitos recebem prefixo `55`; aceitar só se `isLikelyPhoneNumber` for verdadeiro.
- Número novo cria o contato só com telefone, sem nome. Nenhuma mensagem sai até o Enviar.
- `contactId` usa o telefone já salvo, só com dígitos (`sanitizePhoneForMeta`). Não aplicar o prefixo `55` de novo, para não duplicar o contato.
- Se o `id` já está na lista, só seleciona. Se não está, insere no topo. A busca limpa e o campo de mensagem recebe foco.
- Texto quando não há conversa filtrada, contato nem número novo: `Nenhum contato encontrado`.
- Rótulo do número novo: `Iniciar conversa com {número formatado}`.
- Fora de escopo: enviar a primeira mensagem sozinho, pedir nome, buscar no histórico, mudar Sincronizar ou o diálogo de salvar contato.

---

### Task 1: Regra pura da busca

**Files:**
- Create: `src/domain/inbox/start-chat.ts`
- Test: `src/domain/inbox/start-chat.test.ts`

**Interfaces:**
- Consumes: `isLikelyPhoneNumber` de `src/domain/whatsapp/format-phone.ts`
- Produces:
  - `normalizeStartPhone(raw: string): string | null`
  - `InboxStartContact = { id: string; name: string | null; phone: string; avatar_url?: string | null }`
  - `buildInboxStartResults<C extends { id: string; last_message_text: string | null; contact: { id: string; name: string | null; phone: string } | null }, T extends InboxStartContact>(args: { query: string; conversations: C[]; contacts: T[] }): { conversations: C[]; contacts: T[]; startPhone: string | null }`

- [ ] **Step 1: Write the failing test**

Criar `src/domain/inbox/start-chat.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildInboxStartResults,
  normalizeStartPhone,
} from './start-chat'

const conversation = (
  id: string,
  contact: { id: string; name: string | null; phone: string } | null,
  last = 'oi',
) => ({ id, last_message_text: last, contact })

describe('normalizeStartPhone', () => {
  it('prefixes 55 on a Brazilian local mobile', () => {
    expect(normalizeStartPhone('11999998888')).toBe('5511999998888')
  })

  it('prefixes 55 on a 10-digit local number', () => {
    expect(normalizeStartPhone('(11) 3333-4444')).toBe('551133334444')
  })

  it('keeps an already international Brazilian number', () => {
    expect(normalizeStartPhone('+55 11 99999-8888')).toBe('5511999998888')
  })

  it('rejects text and WhatsApp LIDs', () => {
    expect(normalizeStartPhone('maria')).toBeNull()
    expect(normalizeStartPhone('551199999999999')).toBeNull()
  })
})

describe('buildInboxStartResults', () => {
  const conversations = [
    conversation('c1', { id: 'ct1', name: 'Ana', phone: '5511999998888' }, 'bom dia'),
    conversation('c2', { id: 'ct2', name: 'Bia', phone: '5511888887777' }, 'até logo'),
  ]

  it('returns the conversations unchanged when the query is empty', () => {
    const result = buildInboxStartResults({
      query: '   ',
      conversations,
      contacts: [{ id: 'ct9', name: 'Zoe', phone: '5511777776666' }],
    })
    expect(result.conversations).toEqual(conversations)
    expect(result.contacts).toEqual([])
    expect(result.startPhone).toBeNull()
  })

  it('filters conversations by name, phone and last message', () => {
    expect(
      buildInboxStartResults({ query: 'bia', conversations, contacts: [] })
        .conversations.map((c) => c.id),
    ).toEqual(['c2'])
    expect(
      buildInboxStartResults({ query: '7777', conversations, contacts: [] })
        .conversations.map((c) => c.id),
    ).toEqual(['c2'])
    expect(
      buildInboxStartResults({ query: 'bom dia', conversations, contacts: [] })
        .conversations.map((c) => c.id),
    ).toEqual(['c1'])
  })

  it('hides a contact already shown in the filtered conversations', () => {
    const result = buildInboxStartResults({
      query: 'ana',
      conversations,
      contacts: [
        { id: 'ct1', name: 'Ana', phone: '5511999998888' },
        { id: 'ct3', name: 'Ana Paula', phone: '5511666665555' },
      ],
    })
    expect(result.contacts.map((c) => c.id)).toEqual(['ct3'])
  })

  it('keeps a contact found only by email when the local conversation did not match', () => {
    const result = buildInboxStartResults({
      query: 'financeiro',
      conversations,
      contacts: [{ id: 'ct1', name: 'Ana', phone: '5511999998888' }],
    })
    expect(result.conversations).toEqual([])
    expect(result.contacts.map((c) => c.id)).toEqual(['ct1'])
  })

  it('offers a new Brazilian number when nothing matches exactly', () => {
    const result = buildInboxStartResults({
      query: '11999990000',
      conversations,
      contacts: [],
    })
    expect(result.startPhone).toBe('5511999990000')
  })

  it('does not offer a new number already present on a loaded conversation or returned contact', () => {
    expect(
      buildInboxStartResults({
        query: '11999998888',
        conversations,
        contacts: [],
      }).startPhone,
    ).toBeNull()
    expect(
      buildInboxStartResults({
        query: '11777776666',
        conversations,
        contacts: [{ id: 'ct9', name: null, phone: '5511777776666' }],
      }).startPhone,
    ).toBeNull()
  })

  it('does not offer a start phone for ordinary text', () => {
    expect(
      buildInboxStartResults({ query: 'maria', conversations, contacts: [] })
        .startPhone,
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/inbox/start-chat.test.ts`

Expected: FAIL because `./start-chat` does not exist.

- [ ] **Step 3: Write minimal implementation**

Criar `src/domain/inbox/start-chat.ts`:

```ts
import { isLikelyPhoneNumber } from '@/domain/whatsapp/format-phone'

export type InboxStartContact = {
  id: string
  name: string | null
  phone: string
  avatar_url?: string | null
}

type StartConversation = {
  id: string
  last_message_text: string | null
  contact: { id: string; name: string | null; phone: string } | null
}

export function normalizeStartPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`
  }
  if (!isLikelyPhoneNumber(digits)) return null
  return digits
}

function digitsOf(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '')
}

function sameExactPhone(stored: string | null | undefined, normalized: string): boolean {
  const digits = digitsOf(stored)
  if (!digits) return false
  if (digits === normalized) return true
  return normalizeStartPhone(stored ?? '') === normalized
}

function conversationMatches(conversation: StartConversation, query: string): boolean {
  const needle = query.trim().toLowerCase()
  const queryDigits = digitsOf(query)
  const name = conversation.contact?.name?.toLowerCase() ?? ''
  const last = conversation.last_message_text?.toLowerCase() ?? ''
  const phone = digitsOf(conversation.contact?.phone)
  return (
    name.includes(needle) ||
    last.includes(needle) ||
    (queryDigits.length > 0 && phone.includes(queryDigits))
  )
}

export function buildInboxStartResults<
  C extends StartConversation,
  T extends InboxStartContact,
>(args: {
  query: string
  conversations: C[]
  contacts: T[]
}): { conversations: C[]; contacts: T[]; startPhone: string | null } {
  const query = args.query.trim()
  if (!query) {
    return { conversations: args.conversations, contacts: [], startPhone: null }
  }

  const conversations = args.conversations.filter((conversation) =>
    conversationMatches(conversation, query),
  )
  const visibleContactIds = new Set(
    conversations
      .map((conversation) => conversation.contact?.id)
      .filter((id): id is string => Boolean(id)),
  )
  const contacts = args.contacts.filter(
    (contact) => !visibleContactIds.has(contact.id),
  )
  const normalized = normalizeStartPhone(query)
  const taken =
    normalized != null &&
    (args.conversations.some((conversation) =>
      sameExactPhone(conversation.contact?.phone, normalized),
    ) ||
      args.contacts.some((contact) => sameExactPhone(contact.phone, normalized)))

  return {
    conversations,
    contacts,
    startPhone: normalized && !taken ? normalized : null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/inbox/start-chat.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/inbox/start-chat.ts src/domain/inbox/start-chat.test.ts
git commit -m "$(cat <<'EOF'
feat: decide which inbox search rows open a chat

EOF
)"
```

---

### Task 2: Abrir ou reusar a conversa

**Files:**
- Create: `src/domain/inbox/open-conversation.ts`
- Test: `src/domain/inbox/open-conversation.test.ts`
- Modify: `src/app/api/inbox/conversations/route.ts`
- Test: `src/app/api/inbox/conversations/route.test.ts`

**Interfaces:**
- Consumes: `normalizeStartPhone` da Task 1; `resolveConversation({ accountId, phone, contactName? })` de `src/domain/whatsapp/resolve-conversation.ts`; `sanitizePhoneForMeta` de `src/domain/whatsapp/phone-utils.ts`; `requireSessionAccount`, `getOrgRolePermissions`, `canSendMessages` no mesmo padrão de `src/app/api/whatsapp/send/route.ts`
- Produces:
  - `InboxConversationError` com `status: number`
  - `openInboxConversation(args: { accountId: string; contactId?: string | null; phone?: string | null }): Promise<OpenedInboxConversation>`
  - `OpenedInboxConversation` com `id`, `status`, `unread_count`, `last_message_text`, `last_message_at`, `assigned_agent_id`, `contact | null`, `created: boolean`
  - `POST` em `src/app/api/inbox/conversations/route.ts`

- [ ] **Step 1: Write the failing domain test**

Criar `src/domain/inbox/open-conversation.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  contactFindFirst: vi.fn(),
  conversationFindFirst: vi.fn(),
  resolveConversation: vi.fn(),
}))

vi.mock('@/domain/db/prisma', () => ({
  prisma: {
    contact: { findFirst: mocks.contactFindFirst },
    conversation: { findFirst: mocks.conversationFindFirst },
  },
}))

vi.mock('@/domain/whatsapp/resolve-conversation', () => ({
  resolveConversation: mocks.resolveConversation,
}))

const conversationRow = {
  id: 'conv-1',
  status: 'open',
  unreadCount: 0,
  lastMessageText: null,
  lastMessageAt: null,
  assignedAgentId: null,
  contact: {
    id: 'ct-1',
    name: null,
    phone: '5511999990000',
    avatarUrl: null,
  },
}

describe('openInboxConversation', () => {
  beforeEach(() => {
    mocks.contactFindFirst.mockReset()
    mocks.conversationFindFirst.mockReset()
    mocks.resolveConversation.mockReset()
  })

  it('rejects a blocked contact before resolving a conversation', async () => {
    mocks.contactFindFirst.mockResolvedValue({
      id: 'ct-1',
      phone: '5511999990000',
      blockedAt: new Date(),
    })
    const { openInboxConversation, InboxConversationError } = await import(
      './open-conversation'
    )
    await expect(
      openInboxConversation({ accountId: 'acc', contactId: 'ct-1' }),
    ).rejects.toMatchObject({
      name: 'InboxConversationError',
      message: 'Contato na blacklist',
      status: 403,
    })
    expect(mocks.resolveConversation).not.toHaveBeenCalled()
    expect(InboxConversationError).toBeDefined()
  })

  it('rejects a contact from another account', async () => {
    mocks.contactFindFirst.mockResolvedValue(null)
    const { openInboxConversation } = await import('./open-conversation')
    await expect(
      openInboxConversation({ accountId: 'acc', contactId: 'missing' }),
    ).rejects.toMatchObject({ status: 404 })
    expect(mocks.resolveConversation).not.toHaveBeenCalled()
  })

  it('rejects an invalid phone', async () => {
    const { openInboxConversation } = await import('./open-conversation')
    await expect(
      openInboxConversation({ accountId: 'acc', phone: 'maria' }),
    ).rejects.toMatchObject({ message: 'Telefone inválido', status: 400 })
    expect(mocks.resolveConversation).not.toHaveBeenCalled()
  })

  it('rejects a blocked phone before resolving a conversation', async () => {
    mocks.contactFindFirst.mockResolvedValue({
      id: 'ct-1',
      phone: '5511999990000',
      blockedAt: new Date(),
    })
    const { openInboxConversation } = await import('./open-conversation')
    await expect(
      openInboxConversation({ accountId: 'acc', phone: '11999990000' }),
    ).rejects.toMatchObject({
      message: 'Contato na blacklist',
      status: 403,
    })
    expect(mocks.resolveConversation).not.toHaveBeenCalled()
  })

  it('rejects when both contactId and phone are sent', async () => {
    const { openInboxConversation } = await import('./open-conversation')
    await expect(
      openInboxConversation({
        accountId: 'acc',
        contactId: 'ct-1',
        phone: '11999990000',
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(mocks.contactFindFirst).not.toHaveBeenCalled()
  })

  it('delegates a new phone to resolveConversation without a name', async () => {
    mocks.contactFindFirst.mockResolvedValue(null)
    mocks.resolveConversation.mockResolvedValue({
      conversationId: 'conv-1',
      contactId: 'ct-1',
      created: true,
    })
    mocks.conversationFindFirst.mockResolvedValue(conversationRow)
    const { openInboxConversation } = await import('./open-conversation')
    const opened = await openInboxConversation({
      accountId: 'acc',
      phone: '11999990000',
    })
    expect(mocks.resolveConversation).toHaveBeenCalledWith({
      accountId: 'acc',
      phone: '5511999990000',
    })
    expect(opened).toMatchObject({
      id: 'conv-1',
      created: true,
      unread_count: 0,
      last_message_text: null,
      contact: { id: 'ct-1', name: null, phone: '5511999990000' },
    })
  })

  it('reuses the stored phone when opening by contactId', async () => {
    mocks.contactFindFirst.mockResolvedValue({
      id: 'ct-1',
      phone: '5511999990000',
      blockedAt: null,
    })
    mocks.resolveConversation.mockResolvedValue({
      conversationId: 'conv-1',
      contactId: 'ct-1',
      created: false,
    })
    mocks.conversationFindFirst.mockResolvedValue(conversationRow)
    const { openInboxConversation } = await import('./open-conversation')
    const opened = await openInboxConversation({
      accountId: 'acc',
      contactId: 'ct-1',
    })
    expect(mocks.resolveConversation).toHaveBeenCalledWith({
      accountId: 'acc',
      phone: '5511999990000',
    })
    expect(opened.created).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/inbox/open-conversation.test.ts`

Expected: FAIL because `./open-conversation` does not exist.

- [ ] **Step 3: Write the domain function**

Criar `src/domain/inbox/open-conversation.ts`:

```ts
import { prisma } from '@/domain/db/prisma'
import { normalizeStartPhone } from '@/domain/inbox/start-chat'
import { sanitizePhoneForMeta } from '@/domain/whatsapp/phone-utils'
import { resolveConversation } from '@/domain/whatsapp/resolve-conversation'

export class InboxConversationError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'InboxConversationError'
    this.status = status
  }
}

export type OpenedInboxConversation = {
  id: string
  status: string
  unread_count: number
  last_message_text: string | null
  last_message_at: string | null
  assigned_agent_id: string | null
  contact: {
    id: string
    name: string | null
    phone: string
    avatar_url: string | null
  } | null
  created: boolean
}

export async function openInboxConversation(args: {
  accountId: string
  contactId?: string | null
  phone?: string | null
}): Promise<OpenedInboxConversation> {
  const contactId = args.contactId?.trim() ?? ''
  const rawPhone = args.phone?.trim() ?? ''
  if (Boolean(contactId) === Boolean(rawPhone)) {
    throw new InboxConversationError('Informe contactId ou phone', 400)
  }

  let phone: string
  if (contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, accountId: args.accountId },
    })
    if (!contact) {
      throw new InboxConversationError('Contato não encontrado', 404)
    }
    if (contact.blockedAt) {
      throw new InboxConversationError('Contato na blacklist', 403)
    }
    phone = sanitizePhoneForMeta(contact.phone)
    if (!phone) {
      throw new InboxConversationError('Telefone inválido', 400)
    }
  } else {
    const normalized = normalizeStartPhone(rawPhone)
    if (!normalized) {
      throw new InboxConversationError('Telefone inválido', 400)
    }
    const blocked = await prisma.contact.findFirst({
      where: {
        accountId: args.accountId,
        blockedAt: { not: null },
        OR: [{ phone: normalized }, { phoneNormalized: normalized }],
      },
    })
    if (blocked) {
      throw new InboxConversationError('Contato na blacklist', 403)
    }
    phone = normalized
  }

  const resolved = await resolveConversation({
    accountId: args.accountId,
    phone,
  })

  const conversation = await prisma.conversation.findFirst({
    where: { id: resolved.conversationId, accountId: args.accountId },
    include: { contact: true },
  })
  if (!conversation) {
    throw new InboxConversationError('Conversa não encontrada', 404)
  }

  return {
    id: conversation.id,
    status: conversation.status,
    unread_count: conversation.unreadCount,
    last_message_text: conversation.lastMessageText,
    last_message_at: conversation.lastMessageAt?.toISOString() ?? null,
    assigned_agent_id: conversation.assignedAgentId,
    contact: conversation.contact
      ? {
          id: conversation.contact.id,
          name: conversation.contact.name,
          phone: conversation.contact.phone,
          avatar_url: conversation.contact.avatarUrl,
        }
      : null,
    created: resolved.created,
  }
}
```

- [ ] **Step 4: Run the domain test**

Run: `npx vitest run src/domain/inbox/open-conversation.test.ts`

Expected: PASS

- [ ] **Step 5: Add POST to the conversations route**

Em `src/app/api/inbox/conversations/route.ts`, manter o `GET` como está. Acrescentar imports e o `POST` abaixo dele:

```ts
import { getOrgRolePermissions } from '@/domain/auth/org-roles'
import { canSendMessages } from '@/domain/auth/roles'
import {
  InboxConversationError,
  openInboxConversation,
} from '@/domain/inbox/open-conversation'
```

```ts
export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const permissions = await getOrgRolePermissions(ctx.profile.orgRoleId)
    if (
      ctx.role === 'viewer' ||
      !canSendMessages({ accountRole: ctx.role, permissions })
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = (await req.json()) as { contactId?: string; phone?: string }
    const opened = await openInboxConversation({
      accountId: ctx.accountId,
      contactId: body.contactId,
      phone: body.phone,
    })
    return NextResponse.json(opened)
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof InboxConversationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[inbox/conversations POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

- [ ] **Step 6: Write the failing route test**

Acrescentar em `src/app/api/inbox/conversations/route.test.ts`, sem apagar o teste do `GET`:

Não repetir o import do `vitest`. O bloco abaixo entra depois dos imports já unidos:

```ts
const mocks = vi.hoisted(() => ({
  requireSessionAccount: vi.fn(),
  getOrgRolePermissions: vi.fn(),
  openInboxConversation: vi.fn(),
}))

vi.mock('@/domain/db/prisma', () => ({ prisma: {} }))
vi.mock('@/domain/auth/context', () => ({
  requireSessionAccount: mocks.requireSessionAccount,
}))
vi.mock('@/domain/auth/org-roles', () => ({
  getOrgRolePermissions: mocks.getOrgRolePermissions,
}))

class InboxConversationError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'InboxConversationError'
    this.status = status
  }
}

vi.mock('@/domain/inbox/open-conversation', () => ({
  openInboxConversation: mocks.openInboxConversation,
  InboxConversationError,
}))

describe('POST /api/inbox/conversations', () => {
  beforeEach(() => {
    mocks.requireSessionAccount.mockReset()
    mocks.getOrgRolePermissions.mockReset().mockResolvedValue(new Set(['inbox.send']))
    mocks.openInboxConversation.mockReset()
  })

  it('forbids a viewer', async () => {
    mocks.requireSessionAccount.mockResolvedValue({
      accountId: 'acc',
      role: 'viewer',
      profile: { orgRoleId: 'role' },
    })
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://local/api/inbox/conversations', {
        method: 'POST',
        body: JSON.stringify({ phone: '11999990000' }),
      }),
    )
    expect(res.status).toBe(403)
    expect(mocks.openInboxConversation).not.toHaveBeenCalled()
  })

  it('returns the opened conversation', async () => {
    mocks.requireSessionAccount.mockResolvedValue({
      accountId: 'acc',
      role: 'agent',
      profile: { orgRoleId: 'role' },
    })
    mocks.openInboxConversation.mockResolvedValue({ id: 'conv-1', created: true })
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://local/api/inbox/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '11999990000' }),
      }),
    )
    expect(res.status).toBe(200)
    expect(mocks.openInboxConversation).toHaveBeenCalledWith({
      accountId: 'acc',
      contactId: undefined,
      phone: '11999990000',
    })
  })

  it('maps a domain error to its status', async () => {
    mocks.requireSessionAccount.mockResolvedValue({
      accountId: 'acc',
      role: 'agent',
      profile: { orgRoleId: 'role' },
    })
    mocks.openInboxConversation.mockRejectedValue(
      new InboxConversationError('Contato na blacklist', 403),
    )
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://local/api/inbox/conversations', {
        method: 'POST',
        body: JSON.stringify({ contactId: 'ct-1' }),
      }),
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Contato na blacklist' })
  })
})
```

O `describe` do GET que já existe continua no mesmo arquivo. Juntar os imports no topo: o teste atual usa `readFileSync`, `resolve`, `describe`, `expect`, `it`. Adicionar `beforeEach` e `vi` a esse import do `vitest` em vez de duplicar a linha.

- [ ] **Step 7: Run the route test**

Run: `npx vitest run src/app/api/inbox/conversations/route.test.ts src/domain/inbox/open-conversation.test.ts`

Expected: PASS, inclusive o teste antigo do GET.

- [ ] **Step 8: Commit**

```bash
git add src/domain/inbox/open-conversation.ts src/domain/inbox/open-conversation.test.ts src/app/api/inbox/conversations/route.ts src/app/api/inbox/conversations/route.test.ts
git commit -m "$(cat <<'EOF'
feat: open an inbox conversation for a contact or phone

EOF
)"
```

---

### Task 3: Campo de busca na Inbox

**Files:**
- Modify: `src/app/(dashboard)/inbox/page.tsx`

**Interfaces:**
- Consumes: `buildInboxStartResults` da Task 1; `POST /api/inbox/conversations` da Task 2; `inboxKeys`, `InboxConversation` e `apiFetch` já usados na página
- Produces: campo "Buscar contato ou número" no topo da coluna; clique em contato ou número chama o POST, seleciona a conversa e foca o compositor

- [ ] **Step 1: Add search state and the open action**

Em `src/app/(dashboard)/inbox/page.tsx`, importar `buildInboxStartResults` de `@/domain/inbox/start-chat` e acrescentar `type InboxConversation` ao import de `@/hooks/inbox/types`.

Dentro de `InboxPage`, depois dos estados já existentes, adicionar:

```tsx
const [query, setQuery] = useState('')
const [contactHits, setContactHits] = useState<
  Array<{
    id: string
    name: string | null
    phone: string
    avatar_url: string | null
  }>
>([])
const [searchingContacts, setSearchingContacts] = useState(false)
const [openingChat, setOpeningChat] = useState(false)
const searchGen = useRef(0)
const composerRef = useRef<HTMLInputElement | null>(null)
const focusComposerRef = useRef(false)
```

Efeito da busca, ao lado dos outros `useEffect`:

```tsx
useEffect(() => {
  const q = query.trim()
  if (q.length < 2) {
    setContactHits([])
    setSearchingContacts(false)
    return
  }
  const gen = ++searchGen.current
  setSearchingContacts(true)
  const timer = setTimeout(() => {
    void apiFetch(`/api/contacts?q=${encodeURIComponent(q)}&pageSize=20`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          contacts?: Array<{
            id: string
            name: string | null
            phone: string
            avatar_url: string | null
          }>
        }
        if (!res.ok) throw new Error(data.error ?? 'Falha ao buscar contatos')
        return data.contacts ?? []
      })
      .then((contacts) => {
        if (searchGen.current !== gen) return
        setContactHits(contacts)
      })
      .catch((err: unknown) => {
        if (searchGen.current !== gen) return
        setContactHits([])
        toast.error(
          err instanceof Error ? err.message : 'Falha ao buscar contatos',
        )
      })
      .finally(() => {
        if (searchGen.current === gen) setSearchingContacts(false)
      })
  }, 300)
  return () => clearTimeout(timer)
}, [query])
```

Resultado e foco:

```tsx
const results = useMemo(
  () => buildInboxStartResults({ query, conversations, contacts: contactHits }),
  [query, conversations, contactHits],
)
const visibleConversations = query.trim() ? results.conversations : conversations

useEffect(() => {
  if (!focusComposerRef.current || !selected) return
  focusComposerRef.current = false
  composerRef.current?.focus()
}, [selected, conversations])
```

Função `openChat` ao lado de `selectConversation`:

```tsx
const openChat = async (body: { contactId?: string; phone?: string }) => {
  if (openingChat) return
  setOpeningChat(true)
  try {
    const res = await apiFetch('/api/inbox/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as {
      error?: string
      id?: string
      created?: boolean
    } & InboxConversation
    if (!res.ok || !data.id) {
      throw new Error(data.error ?? 'Falha ao abrir a conversa')
    }
    const { created: _created, ...conversation } = data
    queryClient.setQueryData<InboxConversation[]>(
      inboxKeys.conversations(),
      (list) => {
        const current = list ?? []
        if (current.some((item) => item.id === conversation.id)) return current
        return [conversation, ...current]
      },
    )
    focusComposerRef.current = true
    setSelected(conversation.id)
    setQuery('')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Falha ao abrir a conversa')
  } finally {
    setOpeningChat(false)
  }
}
```

Não chamar `useSendMessage` nesse fluxo.

- [ ] **Step 2: Render the search column**

Trocar o `<aside className="w-80 overflow-y-auto border-r border-border">` por uma coluna com o campo fixo e a lista rolando. O `map` passa a usar `visibleConversations` no lugar de `conversations`. O botão de cada conversa existente permanece igual, só que o clique também limpa a busca:

```tsx
onClick={() => {
  setQuery('')
  selectConversation(c.id)
}}
```

Estrutura da aside:

```tsx
<aside className="flex w-80 min-h-0 flex-col border-r border-border">
  <div className="border-b border-border bg-background p-2">
    <Input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Buscar contato ou número"
      aria-label="Buscar contato ou número"
    />
    {searchingContacts ? (
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Buscando contatos…
      </p>
    ) : null}
  </div>
  <div className="min-h-0 flex-1 overflow-y-auto">
    {/* map de visibleConversations, botões iguais aos de hoje */}
    {query.trim()
      ? results.contacts.map((contact) => (
          <button
            key={contact.id}
            type="button"
            disabled={openingChat}
            className="flex w-full gap-3 border-b border-border px-3 py-3 text-left hover:bg-muted disabled:opacity-50"
            onClick={() => void openChat({ contactId: contact.id })}
          >
            <ContactAvatar contact={contact} />
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">
                {contactDisplayName(contact)}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                Iniciar conversa
              </span>
            </span>
          </button>
        ))
      : null}
    {query.trim() && results.startPhone ? (
      <button
        type="button"
        disabled={openingChat}
        className="flex w-full border-b border-border px-3 py-3 text-left text-sm hover:bg-muted disabled:opacity-50"
        onClick={() => void openChat({ phone: results.startPhone! })}
      >
        Iniciar conversa com {formatWhatsAppPhone(results.startPhone)}
      </button>
    ) : null}
    {query.trim() &&
    results.conversations.length === 0 &&
    results.contacts.length === 0 &&
    !results.startPhone ? (
      <p className="p-4 text-sm text-muted-foreground">
        Nenhum contato encontrado.
      </p>
    ) : null}
    {!query.trim() && conversations.length === 0 ? (
      <div className="space-y-2 p-4 text-sm text-muted-foreground">
        <p>Nenhuma conversa ainda.</p>
        <p className="text-xs">
          Envie uma mensagem para o número conectado e clique em
          Sincronizar, ou configure um webhook público (não use
          localhost).
        </p>
      </div>
    ) : null}
  </div>
</aside>
```

No `<Input>` da mensagem (o que tem `placeholder="Mensagem…"`), acrescentar `ref={composerRef}`. O componente `Input` repassa as props, e o React 19 entrega `ref` por prop.

- [ ] **Step 3: Check the edited page**

Run: `npx tsc --noEmit --pretty false`

Expected: sem erro novo em `src/app/(dashboard)/inbox/page.tsx`.

Run: `npx vitest run src/domain/inbox/start-chat.test.ts src/domain/inbox/open-conversation.test.ts src/app/api/inbox/conversations/route.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/inbox/page.tsx docs/superpowers/specs/2026-11-12-inbox-start-chat-design.md docs/superpowers/plans/2026-11-12-inbox-start-chat.md docs/session-log.md
git commit -m "$(cat <<'EOF'
feat: search a saved contact or number from the inbox

EOF
)"
```

Incluir no mesmo commit o append em `docs/session-log.md` descrevendo a busca, a rota e a página. Impacto: Frontend e Backend. Validação: os três comandos de teste acima e os cinco passos da seção "Como validar na tela" da spec.

- [ ] **Step 5: Check the screen**

Com o app no ar, seguir os cinco passos de `docs/superpowers/specs/2026-11-12-inbox-start-chat-design.md` na seção "Como validar na tela". O campo vazio não esconde conversas. Um contato sem conversa abre o fio vazio com foco na mensagem. Um celular sem DDI mostra `Iniciar conversa com +55 …`. Contato bloqueado mostra o toast e não troca a conversa selecionada.
