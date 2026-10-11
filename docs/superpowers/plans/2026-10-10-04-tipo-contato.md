# Tipo do contato Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada conta tem um catálogo de categorias (nome e cor). Cada contato tem no máximo um `typeId`, e pode ficar sem tipo.

**Architecture:** Model novo `ContactType`. `Contact.typeId` opcional, FK com `onDelete: SetNull`. CRUD em `/api/contact-types`. A página `/contacts` administra o catálogo e atribui o tipo. Trocar o tipo não altera telefone, conversa nem mensagem. `Tag` não é reutilizado.

**Tech Stack:** Prisma, Route Handlers, Vitest, a página de contatos que já existe.

## Global Constraints

- Um app Next.js na raiz. Domínio em `src/domain`. Prisma na raiz. Sem segundo serviço (ADR 004).
- `typeId` é opcional. Contato sem tipo é válido.
- No máximo um tipo por contato. Não é lista.
- Nome do tipo é único por conta, comparação depois de `trim`. Cor default `#64748b`.
- Apagar um tipo põe `typeId` null nos contatos. Não apaga o contato.
- `GET /api/contacts?typeId=<uuid>` devolve só contatos da conta com aquele tipo. Sem o parâmetro, devolve todos, como hoje.
- Não criar tags novas e não migrar tags existentes para tipo.
- Subir `PRISMA_SCHEMA_VERSION` de `4` para `5` em `src/domain/db/prisma.ts`. Se o arquivo ainda estiver em `3` porque o plano 1 não rodou, parar e executar o plano 1 antes.

---

### Task 1: Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/domain/db/prisma.ts`

**Interfaces:**
- Consumes: model `Tenant`, model `Contact`
- Produces: model `ContactType` e `Contact.typeId String?`

- [ ] **Step 1: Write the failing test**

`src/domain/contacts/contact-type-schema.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ContactType schema', () => {
  const schema = readFileSync(
    resolve(process.cwd(), 'prisma/schema.prisma'),
    'utf8',
  )

  it('defines an optional type on the contact and a per-account catalog', () => {
    expect(schema).toContain('model ContactType')
    expect(schema).toContain('typeId')
    expect(schema).toContain('@map("type_id")')
    expect(schema).toContain('@@unique([accountId, name])')
    expect(schema).toContain('@map("contact_types")')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/contacts/contact-type-schema.test.ts`

Expected: FAIL, `ContactType` ainda não existe.

- [ ] **Step 3: Write minimal implementation**

No model `Tenant`, junto de `tags`:

```prisma
  contactTypes          ContactType[]
```

No model `Contact`, depois de `company`:

```prisma
  typeId          String?  @map("type_id") @db.Uuid
  contactType     ContactType? @relation(fields: [typeId], references: [id], onDelete: SetNull)
```

E o index `@@index([accountId, typeId])`.

Model novo, depois de `Contact`:

```prisma
model ContactType {
  id        String   @id @default(uuid()) @db.Uuid
  accountId String   @map("account_id") @db.Uuid
  name      String
  color     String   @default("#64748b")
  createdAt DateTime @default(now()) @map("created_at")

  account  Tenant    @relation(fields: [accountId], references: [id], onDelete: Cascade)
  contacts Contact[]

  @@unique([accountId, name])
  @@index([accountId])
  @@map("contact_types")
}
```

`PRISMA_SCHEMA_VERSION = 5`.

Run: `pnpm exec prisma migrate dev --name contact_type`

Expected: migration `contact_types` + coluna `contacts.type_id` nullable, FK `ON DELETE SET NULL`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/contacts/contact-type-schema.test.ts`

Expected: PASS. Em seguida `pnpm exec prisma generate`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/domain/db/prisma.ts src/domain/contacts/contact-type-schema.test.ts
git commit -m "feat: add an optional contact type catalog"
```

---

### Task 2: Validar nome e cor

**Files:**
- Create: `src/domain/contacts/contact-type.ts`
- Test: `src/domain/contacts/contact-type.test.ts`

**Interfaces:**
- Produces: `parseContactTypeInput(input: { name: unknown; color: unknown }): { ok: true; name: string; color: string } | { ok: false; error: string }`

Regras:

- `name` string, `trim`, comprimento 1–40. Vazio → `'Nome obrigatório'`. Maior que 40 → `'Nome longo demais'`.
- `color` ausente, null ou `''` → `'#64748b'`.
- `color` presente precisa casar `/^#[0-9a-fA-F]{6}$/`. Senão → `'Cor inválida'`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { parseContactTypeInput } from './contact-type'

describe('parseContactTypeInput', () => {
  it('trims the name and defaults the color', () => {
    expect(parseContactTypeInput({ name: '  Lead frio  ', color: '' })).toEqual({
      ok: true,
      name: 'Lead frio',
      color: '#64748b',
    })
  })

  it('accepts a hex color', () => {
    expect(parseContactTypeInput({ name: 'Cliente', color: '#112233' })).toEqual({
      ok: true,
      name: 'Cliente',
      color: '#112233',
    })
  })

  it('rejects an empty name, a long name and a bad color', () => {
    expect(parseContactTypeInput({ name: '   ', color: '#112233' })).toEqual({
      ok: false,
      error: 'Nome obrigatório',
    })
    expect(
      parseContactTypeInput({ name: 'a'.repeat(41), color: '#112233' }),
    ).toEqual({ ok: false, error: 'Nome longo demais' })
    expect(parseContactTypeInput({ name: 'Cliente', color: 'blue' })).toEqual({
      ok: false,
      error: 'Cor inválida',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/contacts/contact-type.test.ts`

Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

Implementar `parseContactTypeInput` com as regras acima. Não acessar Prisma.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/contacts/contact-type.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/contacts/contact-type.ts src/domain/contacts/contact-type.test.ts
git commit -m "feat: validate contact type name and color"
```

---

### Task 3: API do catálogo e do contato

**Files:**
- Create: `src/app/api/contact-types/route.ts`
- Create: `src/app/api/contact-types/[id]/route.ts`
- Modify: `src/app/api/contacts/route.ts`
- Modify: `src/app/api/contacts/[id]/route.ts`

**Interfaces:**
- Consumes: `parseContactTypeInput`, `requireSessionAccount`
- Produces:
  - `GET /api/contact-types` → `{ types: Array<{ id, name, color }> }` da conta, ordem por `name`
  - `POST /api/contact-types` body `{ name, color? }` → `201` e o tipo, ou `400` com `{ error }` do parser, ou `409` se o unique estourar (`P2002`) com `{ error: 'Tipo já existe' }`
  - `PATCH /api/contact-types/:id` mesmo parser, `404` se não for da conta
  - `DELETE /api/contact-types/:id` → `{ ok: true }`, contatos ficam com `typeId` null por causa do `SetNull`
  - `PATCH /api/contacts/:id` aceita `typeId: string | null`. String tem de ser um tipo da mesma conta, senão `400` `{ error: 'Tipo inválido' }`. `null` limpa.
  - `GET /api/contacts` inclui `type: { id, name, color } | null` em cada contato. Query `typeId` filtra.

- [ ] **Step 1: Write the failing test**

`src/app/api/contacts/type-filter.test.ts` lê o fonte:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('contacts API type filter', () => {
  it('filters by typeId and returns the type', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/api/contacts/route.ts'),
      'utf8',
    )
    expect(src).toContain('typeId')
    expect(src).toContain('contactType')
  })

  it('exposes catalog routes', () => {
    const list = readFileSync(
      resolve(process.cwd(), 'src/app/api/contact-types/route.ts'),
      'utf8',
    )
    expect(list).toContain('parseContactTypeInput')
    expect(list).toContain('requireSessionAccount')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/api/contacts/type-filter.test.ts`

Expected: FAIL, arquivo de rota inexistente ou sem `typeId`.

- [ ] **Step 3: Write minimal implementation**

Implementar as rotas com `requireSessionAccount` e `prisma`, no mesmo estilo de `src/app/api/contacts/[id]/route.ts` (`err instanceof Response`).

`GET /api/contacts`: onde o `where` da conta é montado, acrescentar `...(typeId ? { typeId } : {})` lendo `url.searchParams.get('typeId')`. `include: { contactType: { select: { id: true, name: true, color: true } } }`. No JSON, `type: row.contactType`.

`PATCH` do contato: se `'typeId' in body`, quando `body.typeId === null` gravar `typeId: null`. Quando for string, `findFirst` em `contactType` com `id` e `accountId`. Se não achar, `400`. Não alterar `phone` nesse ramo.

POST do catálogo: `parseContactTypeInput`. `ok: false` → 400. Create com `accountId` da sessão. `P2002` → 409.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/api/contacts/type-filter.test.ts src/domain/contacts/contact-type.test.ts src/domain/contacts/contact-type-schema.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/contact-types src/app/api/contacts/route.ts src/app/api/contacts/\[id\]/route.ts src/app/api/contacts/type-filter.test.ts
git commit -m "feat: manage contact types and assign one per contact"
```

---

### Task 4: Catálogo e atribuição na página de contatos

**Files:**
- Create: `src/components/contacts/contact-type-panel.tsx`
- Modify: `src/app/(dashboard)/contacts/page.tsx`

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/contact-types`, `PATCH /api/contacts/:id` com `{ typeId }`
- Produces: painel “Tipos de lead” acima da tabela, e um `<select>` em cada linha

- [ ] **Step 1: Write the failing test**

`src/components/contacts/contact-type-panel.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('contact type panel', () => {
  it('is mounted on the contacts page and talks to the catalog API', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/app/(dashboard)/contacts/page.tsx'),
      'utf8',
    )
    const panel = readFileSync(
      resolve(process.cwd(), 'src/components/contacts/contact-type-panel.tsx'),
      'utf8',
    )
    expect(page).toContain('ContactTypePanel')
    expect(panel).toContain('/api/contact-types')
    expect(panel).toContain('typeId')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/contacts/contact-type-panel.test.ts`

Expected: FAIL, componente inexistente.

- [ ] **Step 3: Write minimal implementation**

`ContactTypePanel` (`'use client'`):

- Estado `types: Array<{ id: string; name: string; color: string }>`.
- No mount, `GET /api/contact-types`.
- Form: input nome, input `type="color"` default `#64748b`, botão “Adicionar tipo”. POST `{ name, color }`. Em 409, toast “Tipo já existe”.
- Lista os tipos com um círculo da cor e botão “Apagar” que DELETE e recarrega.
- Exportar também `ContactTypeSelect` no mesmo arquivo: `<select>` com opção “Sem tipo” (`value=""`) e uma option por tipo. `onChange` chama `PATCH /api/contacts/${contactId}` com `{ typeId: value || null }`.

Na página, renderizar `<ContactTypePanel />` acima da tabela. Estender `ContactRow` com `type: { id: string; name: string; color: string } | null`. Nova coluna “Tipo” com `ContactTypeSelect`. Criar contato continua só com telefone e nome; tipo fica vazio.

O painel recebe `onChange` opcional para a página dar `load()` depois de criar ou apagar tipo.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/contacts/contact-type-panel.test.ts src/domain/contacts/contact-type.test.ts`

Expected: PASS

Abrir `/contacts` no browser: criar o tipo “Lead frio”, ver na lista, atribuir a um contato, recarregar e confirmar que o select permanece. Apagar o tipo e confirmar que o contato continua na lista com “Sem tipo”.

- [ ] **Step 5: Commit**

```bash
git add src/components/contacts/contact-type-panel.tsx src/components/contacts/contact-type-panel.test.ts src/app/\(dashboard\)/contacts/page.tsx
git commit -m "feat: edit contact types from the contacts page"
```
