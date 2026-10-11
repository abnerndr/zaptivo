# Identidade do contato Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um contato estável por pessoa: a chave é o telefone normalizado (e o `whatsapp_lid` quando existir), o nome digitado no painel não some na fusão, e a listagem da inbox não funde a conta.

**Architecture:** `phonesMatch` passa a ser igualdade de dígitos. O sufixo lixo de JID `@lid` continua só no recorte explícito de prefixo BR (12 e 13 dígitos), não nos últimos 8. O nome do usuário ganha `nameLocked`. `GET /api/inbox/conversations` só lista. A dedupe pesada permanece no sync manual.

**Tech Stack:** Next.js 16, Prisma na raiz, Vitest, Postgres.

## Global Constraints

- Um app Next.js na raiz. Domínio em `src/domain`. Prisma em `prisma/`. Um processo. Sem Nest, `apps/api`, Turborepo, `packages/*` de app, `src/server` ou Supabase.
- ADR 004: sem segundo serviço.
- `phonesMatch` retorna true somente quando `normalizePhone(a) === normalizePhone(b)` e ambos são não vazios.
- `nameLocked` true significa que o nome foi digitado pelo usuário. Push name do WhatsApp não substitui nome travado.
- Se os dois lados da fusão estão travados, vence o nome do contato que está sendo absorvido (o stub em que o usuário acabou de salvar).
- `GET /api/inbox/conversations` não chama `dedupeAccountInbox` nem `mergeOpenConversationsForContact`.
- `POST /api/whatsapp/sync` pode continuar chamando `dedupeAccountInbox`.
- Tags ficam de fora. Não criar `type` neste plano.
- Testes: `pnpm exec vitest run <arquivo>`.
- Ao mudar o schema, subir `PRISMA_SCHEMA_VERSION` em `src/domain/db/prisma.ts` de `3` para `4`.

---

### Task 1: phonesMatch só por igualdade

**Files:**
- Modify: `src/domain/whatsapp/phone-utils.ts` (função `phonesMatch` e remover `isValidBrazilOrE164Phone` se ficar sem uso)
- Test: `src/domain/whatsapp/phone-utils.test.ts`

**Interfaces:**
- Consumes: `normalizePhone(phone: string): string`
- Produces: `phonesMatch(phone1: string, phone2: string): boolean` — true só na igualdade de dígitos

- [ ] **Step 1: Write the failing test**

Substituir o bloco `describe("phonesMatch", ...)` em `src/domain/whatsapp/phone-utils.test.ts` por:

```ts
describe("phonesMatch", () => {
  it("returns true for exact digit matches, ignoring formatting", () => {
    expect(phonesMatch("+37063949836", "37063949836")).toBe(true);
    expect(phonesMatch("+370 6 394 9836", "37063949836")).toBe(true);
    expect(phonesMatch("(415) 555-1212", "+1 415-555-1212")).toBe(true);
  });

  it("does not treat the last 8 digits as the same person", () => {
    expect(phonesMatch("370063949836", "37063949836")).toBe(false);
    expect(phonesMatch("5511999991111", "5521999991111")).toBe(false);
  });

  it("does not treat a junk suffix as the same phone", () => {
    expect(phonesMatch("5516996356302", "551699635630251")).toBe(false);
  });

  it("rejects mismatched numbers and empty input", () => {
    expect(phonesMatch("+37063949836", "+37063949837")).toBe(false);
    expect(phonesMatch("", "37063949836")).toBe(false);
    expect(phonesMatch("1234567", "1234567")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/whatsapp/phone-utils.test.ts`

Expected: FAIL nos casos de últimos 8 dígitos e sufixo, que hoje retornam true.

- [ ] **Step 3: Write minimal implementation**

Substituir `phonesMatch` e apagar `isValidBrazilOrE164Phone`:

```ts
export function phonesMatch(phone1: string, phone2: string): boolean {
  const n1 = normalizePhone(phone1)
  const n2 = normalizePhone(phone2)
  if (!n1 || !n2) return false
  return n1 === n2
}
```

Atualizar o comentário acima da função: a comparação é igualdade de dígitos. Trunk prefix e sufixo de LID não são a mesma pessoa.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/whatsapp/phone-utils.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/whatsapp/phone-utils.ts src/domain/whatsapp/phone-utils.test.ts
git commit -m "fix: match phones only when the digits are equal"
```

---

### Task 2: Prefixo BR explícito, sem varredura de 500 contatos

**Files:**
- Modify: `src/domain/whatsapp/format-phone.ts`
- Test: `src/domain/whatsapp/format-phone.test.ts` (criar)
- Modify: `src/domain/whatsapp/resolve-lid.ts` (`findContactByPhonePrefix`)

**Interfaces:**
- Consumes: `digitsOnly` em `src/domain/whatsapp/format-phone.ts`
- Produces: `brPhonePrefixes(digits: string): string[]` — para um dígito que começa com `55` e tem pelo menos 12 caracteres, devolve o recorte de 13 (se houver) e depois o de 12. Caso contrário, `[]`.

- [ ] **Step 1: Write the failing test**

Criar `src/domain/whatsapp/format-phone.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { brPhonePrefixes } from './format-phone'

describe('brPhonePrefixes', () => {
  it('slices a junk-suffix BR jid into 13 then 12 digits', () => {
    expect(brPhonePrefixes('551699635630251')).toEqual([
      '5516996356302',
      '551699635630',
    ])
  })

  it('returns only the 12-digit slice when that is all there is', () => {
    expect(brPhonePrefixes('551699635630')).toEqual(['551699635630'])
  })

  it('returns empty when the digits are not a BR phone prefix', () => {
    expect(brPhonePrefixes('37063949836')).toEqual([])
    expect(brPhonePrefixes('55123')).toEqual([])
    expect(brPhonePrefixes('')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/whatsapp/format-phone.test.ts`

Expected: FAIL com `brPhonePrefixes` não exportado.

- [ ] **Step 3: Write minimal implementation**

No fim de `src/domain/whatsapp/format-phone.ts`:

```ts
/** Explicit BR slices for a WAHA jid that is a real phone plus junk. Not a fuzzy match. */
export function brPhonePrefixes(digits: string): string[] {
  if (!digits.startsWith('55') || digits.length < 12) return []
  const out: string[] = []
  if (digits.length >= 13) out.push(digits.slice(0, 13))
  out.push(digits.slice(0, 12))
  return out
}
```

Em `findContactByPhonePrefix` (`src/domain/whatsapp/resolve-lid.ts`), trocar a montagem de `candidates` para usar `brPhonePrefixes(incoming)` e **apagar** o bloco que faz `prisma.contact.findMany` com `take: 500` e `phonesMatch`. Se nenhum `findFirst` exato em `phone` ou `phoneNormalized` achar um contato com `isLikelyPhoneNumber`, retornar `null`.

O loop que permanece:

```ts
import { brPhonePrefixes, digitsOnly, isLikelyPhoneNumber } from '@/domain/whatsapp/format-phone'

export async function findContactByPhonePrefix(args: {
  accountId: string
  phoneOrLid: string
}): Promise<{ id: string; phone: string; name: string | null } | null> {
  const incoming = digitsOnly(args.phoneOrLid)
  const candidates = brPhonePrefixes(incoming)
  for (const phone of candidates) {
    if (!isLikelyPhoneNumber(phone)) continue
    const exact = await prisma.contact.findFirst({
      where: {
        accountId: args.accountId,
        OR: [{ phone }, { phoneNormalized: phone }],
      },
      select: { id: true, phone: true, name: true },
    })
    if (exact && isLikelyPhoneNumber(exact.phone)) return exact
  }
  return null
}
```

Em `upgradeContactToPhone`, apagar o `findMany` de 500 contatos que chama `phonesMatch`. A busca do outro contato fica só no `otherExact` (igualdade de `phone` ou `phoneNormalized`). Se `phonesMatch` não tiver mais nenhuma chamada em `resolve-lid.ts`, apagar o import.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/whatsapp/format-phone.test.ts src/domain/whatsapp/phone-utils.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/whatsapp/format-phone.ts src/domain/whatsapp/format-phone.test.ts src/domain/whatsapp/resolve-lid.ts
git commit -m "fix: resolve junk LID suffixes by exact BR prefix only"
```

---

### Task 3: Nome digitado fica travado na fusão

**Files:**
- Create: `src/domain/contacts/name-lock.ts`
- Test: `src/domain/contacts/name-lock.test.ts`
- Modify: `prisma/schema.prisma` (model `Contact`)
- Modify: `src/domain/db/prisma.ts` (`PRISMA_SCHEMA_VERSION = 4`)
- Modify: `src/domain/whatsapp/resolve-lid.ts` (`upgradeContactToPhone`)
- Modify: `src/domain/whatsapp/resolve-conversation.ts` (`findOrCreateContact` e o `updateMany` de push name não mora aqui; o push name mora em `inbound.ts`)
- Modify: `src/domain/whatsapp/inbound.ts` (bloco `if (pushName)`)
- Modify: `src/app/api/contacts/[id]/route.ts`

**Interfaces:**
- Consumes: nada de tarefa anterior além de `phonesMatch` já estreito
- Produces: `preferLockedName(args: { current: { name: string | null; nameLocked: boolean }; survivor: { name: string | null; nameLocked: boolean }; pushName: string | null }): { name: string | null; nameLocked: boolean }`

- [ ] **Step 1: Write the failing test**

Criar `src/domain/contacts/name-lock.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { preferLockedName } from './name-lock'

describe('preferLockedName', () => {
  it('keeps the name the user typed on the stub being merged', () => {
    expect(
      preferLockedName({
        current: { name: 'Maria da loja', nameLocked: true },
        survivor: { name: 'Maria', nameLocked: false },
        pushName: 'Maria',
      }),
    ).toEqual({ name: 'Maria da loja', nameLocked: true })
  })

  it('keeps a locked name already on the surviving contact', () => {
    expect(
      preferLockedName({
        current: { name: 'Maria', nameLocked: false },
        survivor: { name: 'Maria CRM', nameLocked: true },
        pushName: 'Maria',
      }),
    ).toEqual({ name: 'Maria CRM', nameLocked: true })
  })

  it('prefers the stub when both names are locked', () => {
    expect(
      preferLockedName({
        current: { name: 'Nome novo', nameLocked: true },
        survivor: { name: 'Nome antigo', nameLocked: true },
        pushName: 'Push',
      }),
    ).toEqual({ name: 'Nome novo', nameLocked: true })
  })

  it('fills an empty survivor from push name without locking', () => {
    expect(
      preferLockedName({
        current: { name: null, nameLocked: false },
        survivor: { name: null, nameLocked: false },
        pushName: 'Push',
      }),
    ).toEqual({ name: 'Push', nameLocked: false })
  })

  it('does not replace an unlocked survivor name with push name', () => {
    expect(
      preferLockedName({
        current: { name: null, nameLocked: false },
        survivor: { name: 'Já tinha', nameLocked: false },
        pushName: 'Push',
      }),
    ).toEqual({ name: 'Já tinha', nameLocked: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/contacts/name-lock.test.ts`

Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

`src/domain/contacts/name-lock.ts`:

```ts
type Named = { name: string | null; nameLocked: boolean }

function trimmed(name: string | null): string | null {
  const value = name?.trim()
  return value ? value : null
}

/**
 * User-typed names survive a merge. Push name only fills a blank unlocked contact.
 * When both sides are locked, the contact being absorbed wins — that is the
 * record the user just edited.
 */
export function preferLockedName(args: {
  current: Named
  survivor: Named
  pushName: string | null
}): { name: string | null; nameLocked: boolean } {
  const currentName = trimmed(args.current.name)
  if (args.current.nameLocked && currentName) {
    return { name: currentName, nameLocked: true }
  }
  const survivorName = trimmed(args.survivor.name)
  if (args.survivor.nameLocked && survivorName) {
    return { name: survivorName, nameLocked: true }
  }
  if (survivorName) {
    return { name: survivorName, nameLocked: false }
  }
  const fallback = trimmed(args.pushName) ?? currentName
  return { name: fallback, nameLocked: false }
}
```

Em `prisma/schema.prisma`, no model `Contact`, depois de `name`:

```prisma
  name            String?
  nameLocked      Boolean  @default(false) @map("name_locked")
```

Em `src/domain/db/prisma.ts`, `const PRISMA_SCHEMA_VERSION = 4`.

Gerar a migration:

Run: `pnpm exec prisma migrate dev --name contact_name_locked`

Expected: migration criada e client gerado. Se não houver banco local, usar `pnpm exec prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` não serve (from e to iguais). Nesse caso: `pnpm exec prisma migrate dev --name contact_name_locked --create-only` e aplicar depois. Não inventar SQL à mão se o Prisma gerar o arquivo.

Em `upgradeContactToPhone`, no ramo `if (other)`, substituir o `if ((!other.name ...)` por:

```ts
import { preferLockedName } from '@/domain/contacts/name-lock'

const chosen = preferLockedName({
  current: { name: current.name, nameLocked: current.nameLocked },
  survivor: { name: other.name, nameLocked: other.nameLocked },
  pushName: args.name ?? null,
})
await prisma.contact.update({
  where: { id: other.id },
  data: { name: chosen.name, nameLocked: chosen.nameLocked },
})
```

No ramo que atualiza `current` (não há `other`), incluir `name` e `nameLocked` só via a mesma função, tratando `current` como survivor de si mesmo:

```ts
const chosen = preferLockedName({
  current: { name: null, nameLocked: false },
  survivor: { name: current.name, nameLocked: current.nameLocked },
  pushName: args.name ?? null,
})
```

e gravar `name: chosen.name`, `nameLocked: chosen.nameLocked` junto com phone e lid. Assim um contato já travado não recebe push name, e um contato sem nome recebe o push sem travar.

Em `findOrCreateContact`, no `exact` e no create, não gravar `contactName` se `exact.nameLocked` for true. Apagar o `findMany` de 500 contatos (`fuzzy`). Sem match exato em `phone` ou `phoneNormalized`, criar o contato com `nameLocked: false`.

Em `src/domain/whatsapp/inbound.ts`, o `updateMany` do push name ganha `nameLocked: false` no `where`:

```ts
if (pushName) {
  await prisma.contact.updateMany({
    where: {
      accountId,
      nameLocked: false,
      AND: [
        { OR: [{ phone }, { phoneNormalized: phone }] },
        { OR: [{ name: null }, { name: '' }] },
      ],
    },
    data: { name: pushName },
  })
}
```

Em `src/app/api/contacts/[id]/route.ts`, no PATCH, quando `body.name` é string:

```ts
...(typeof body.name === 'string'
  ? {
      name: body.name.trim() || null,
      nameLocked: Boolean(body.name.trim()),
    }
  : {}),
```

Incluir `name_locked: updated.nameLocked` no JSON de resposta.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/contacts/name-lock.test.ts src/domain/whatsapp/phone-utils.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/domain/db/prisma.ts src/domain/contacts/name-lock.ts src/domain/contacts/name-lock.test.ts src/domain/whatsapp/resolve-lid.ts src/domain/whatsapp/resolve-conversation.ts src/domain/whatsapp/inbound.ts src/app/api/contacts/[id]/route.ts
git commit -m "fix: keep user-typed contact names across merges"
```

---

### Task 4: A listagem da inbox só lista

**Files:**
- Modify: `src/app/api/inbox/conversations/route.ts`
- Test: `src/app/api/inbox/conversations/route.test.ts`

**Interfaces:**
- Consumes: `prisma.conversation.findMany` já usado no final do GET
- Produces: GET sem dedupe. O JSON de cada conversa permanece `id`, `status`, `unread_count`, `last_message_text`, `last_message_at`, `assigned_agent_id`, `contact`.

- [ ] **Step 1: Write the failing test**

Criar `src/app/api/inbox/conversations/route.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('GET /api/inbox/conversations', () => {
  it('does not merge contacts or conversations on the list path', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/api/inbox/conversations/route.ts'),
      'utf8',
    )
    expect(src).not.toContain('dedupeAccountInbox')
    expect(src).not.toContain('mergeOpenConversationsForContact')
    expect(src).not.toContain('lastFullDedupe')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/api/inbox/conversations/route.test.ts`

Expected: FAIL porque o arquivo ainda importa e chama os dois.

- [ ] **Step 3: Write minimal implementation**

Deixar o GET assim (auth, filtro `status`, uma linha por contato, o mesmo JSON):

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'

export async function GET(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const url = new URL(req.url)
    const status = url.searchParams.get('status')

    const rows = await prisma.conversation.findMany({
      where: {
        accountId: ctx.accountId,
        ...(status ? { status } : { status: { not: 'closed' } }),
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: { contact: true },
    })

    const seenContact = new Set<string>()
    const unique = []
    for (const c of rows) {
      if (seenContact.has(c.contactId)) continue
      seenContact.add(c.contactId)
      unique.push(c)
    }

    return NextResponse.json({
      conversations: unique.map((c) => ({
        id: c.id,
        status: c.status,
        unread_count: c.unreadCount,
        last_message_text: c.lastMessageText,
        last_message_at: c.lastMessageAt?.toISOString() ?? null,
        assigned_agent_id: c.assignedAgentId,
        contact: c.contact
          ? {
              id: c.contact.id,
              name: c.contact.name,
              phone: c.contact.phone,
              avatar_url: c.contact.avatarUrl,
            }
          : null,
      })),
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

Não apagar `dedupeAccountInbox`. `src/app/api/whatsapp/sync/route.ts` continua chamando.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/api/inbox/conversations/route.test.ts src/domain/contacts/name-lock.test.ts src/domain/whatsapp/phone-utils.test.ts src/domain/whatsapp/format-phone.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/inbox/conversations/route.ts src/app/api/inbox/conversations/route.test.ts
git commit -m "fix: list inbox conversations without merging contacts"
```
