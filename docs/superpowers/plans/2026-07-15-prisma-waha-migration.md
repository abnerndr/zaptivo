# Prisma + Auth.js + R2 + SSE + WAHA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir Supabase (DB/Auth/Storage/Realtime) e Meta WhatsApp Cloud API por PostgreSQL+Prisma, Auth.js (CPF/senha), Cloudflare R2, SSE+NOTIFY e WAHA, mantendo as funcionalidades do CRM.

**Architecture:** Migração strangler em 8 fases. Cada fase deixa o app compilável ou com um caminho de validação claro. Auth.js `Account` (OAuth) mapeia para `auth_accounts`; o tenant CRM continua na tabela `accounts` via model `Tenant`. Camadas novas: `src/lib/db`, `src/lib/auth`, `src/lib/storage`, `src/lib/realtime`, `src/lib/whatsapp/waha-api.ts`.

**Tech Stack:** Next.js 16, Prisma 6 + `@prisma/adapter-pg` + `pg`, Auth.js (`next-auth` v5) + `@auth/prisma-adapter`, `bcryptjs`, `@aws-sdk/client-s3` (R2), WAHA HTTP API, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-prisma-waha-migration-design.md`

**Commits:** Não criar commits nesta execução — o usuário vai inicializar o repositório depois. Ignore passos de `git commit`.

**Nota de escopo:** Este plano é um master plan. Se preferir PRs menores, execute uma **Fase** por vez (Task groups Phase 0–7).

---

## File map (create / replace)

| Path | Responsibility |
|------|----------------|
| `prisma/schema.prisma` | Schema completo (Auth.js + domínio CRM) |
| `prisma.config.ts` | Datasource URL via `DATABASE_URL` |
| `src/lib/db/prisma.ts` | Singleton PrismaClient + adapter-pg |
| `src/lib/db/notify.ts` | `pg_notify` helper |
| `src/lib/auth/cpf.ts` | normalize + validate CPF |
| `src/lib/auth/password.ts` | hash/verify bcrypt |
| `src/lib/auth/session.ts` | `requireSession`, `requireAccountMember` |
| `src/lib/auth/bootstrap.ts` | signup transaction User→Profile→Tenant→membership |
| `src/auth.ts` / `src/auth.config.ts` | Auth.js config (Credentials + Prisma adapter) |
| `src/app/api/auth/[...nextauth]/route.ts` | Auth.js route handlers |
| `src/middleware.ts` | Protect routes via Auth.js (replace Supabase) |
| `src/lib/storage/r2.ts` | R2 upload/remove/publicUrl |
| `src/lib/storage/upload-media.ts` | Rewrite existing helper to R2 |
| `src/app/api/realtime/stream/route.ts` | SSE endpoint |
| `src/hooks/use-realtime.ts` | EventSource client (replace Supabase channel) |
| `src/lib/whatsapp/waha-api.ts` | WAHA HTTP client |
| `src/app/api/whatsapp/webhook/route.ts` | WAHA webhook (replace Meta HMAC) |
| `src/components/settings/whatsapp-config.tsx` | QR / session UI |
| `.env.local.example` / `.env.local` | New env vars |
| Delete after cutover | `src/lib/supabase/*`, `meta-api.ts`, `supabase/migrations` (archive ok) |

**Naming collision (critical):**

```prisma
model Account {           // Auth.js OAuth account
  @@map("auth_accounts")
}
model Tenant {            // CRM multi-tenant account
  @@map("accounts")
  members TenantMember[]
}
model TenantMember {
  @@map("account_members") // or keep profiles.role + account_id pattern from mig 017
}
```

Inspect `017_account_sharing.sql` during Phase 1 and mirror the **actual** membership columns (`account_id` on `profiles` vs join table) — do not invent a second membership model if the codebase already uses `profiles.account_id` + `profiles.role`.

---

## Phase 0 — Tooling & env scaffold

### Task 0: Install deps + env files

**Files:**
- Modify: `package.json`
- Create: `.env.local.example` (replace), `.env.local`
- Create: `docker-compose.yml` (optional local Postgres)

- [ ] **Step 1: Install packages**

```bash
cd /home/abner/www/abnerndr/wacrm
npm install prisma @types/pg --save-dev
npm install @prisma/client @prisma/adapter-pg pg dotenv next-auth@beta @auth/prisma-adapter bcryptjs
npm install @aws-sdk/client-s3
npm install -D @types/bcryptjs tsx
```

Expected: packages in `package.json` without peer errors.

- [ ] **Step 2: Add scripts to `package.json`**

```json
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev",
"db:push": "prisma db push",
"db:studio": "prisma studio"
```

- [ ] **Step 3: Write `.env.local.example`**

Replace the entire file with:

```env
# App
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_LOCALE=pt-BR
AUTH_SECRET=
ENCRYPTION_KEY=

# Postgres
DATABASE_URL=postgresql://wacrm:wacrm@localhost:5432/wacrm?schema=public

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=wacrm
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev

# WAHA
WAHA_BASE_URL=http://localhost:3000
WAHA_API_KEY=
WAHA_WEBHOOK_SECRET=

# Optional
# AUTOMATION_CRON_SECRET=
# AI_REQUEST_TIMEOUT_MS=30000
# AI_CONTEXT_MESSAGE_LIMIT=20
# ALLOWED_INVITE_HOSTS=
# WAHA_TEMPLATES_DRY_RUN=true
```

- [ ] **Step 4: Generate `.env.local` with secrets**

```bash
node -e "
const c=require('crypto');
const auth=c.randomBytes(32).toString('base64');
const enc=c.randomBytes(32).toString('hex');
const wh=c.randomBytes(32).toString('hex');
console.log('AUTH_SECRET='+auth);
console.log('ENCRYPTION_KEY='+enc);
console.log('WAHA_WEBHOOK_SECRET='+wh);
"
```

Create `.env.local` copying the example and pasting those three values. Leave R2/WAHA/DATABASE_URL as placeholders until services exist.

- [ ] **Step 5: Optional local Postgres**

Create `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: wacrm
      POSTGRES_PASSWORD: wacrm
      POSTGRES_DB: wacrm
    ports:
      - "5432:5432"
    volumes:
      - wacrm_pg:/var/lib/postgresql/data
volumes:
  wacrm_pg:
```

Run: `docker compose up -d`  
Expected: Postgres accepting connections on `localhost:5432`.

---

## Phase 1 — Prisma schema + client

### Task 1: Init Prisma + Auth.js models + CPF helpers

**Files:**
- Create: `prisma/schema.prisma`, `prisma.config.ts`, `src/lib/db/prisma.ts`
- Create: `src/lib/auth/cpf.ts`, `src/lib/auth/cpf.test.ts`
- Create: `src/lib/auth/password.ts`, `src/lib/auth/password.test.ts`

- [ ] **Step 1: Write failing CPF tests**

```ts
// src/lib/auth/cpf.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeCpf, isValidCpf } from './cpf'

describe('cpf', () => {
  it('normalizes to digits only', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725')
  })
  it('accepts valid CPF', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
  })
  it('rejects invalid CPF', () => {
    expect(isValidCpf('111.111.111-11')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/lib/auth/cpf.test.ts
```

Expected: cannot find module `./cpf`.

- [ ] **Step 3: Implement CPF helpers**

```ts
// src/lib/auth/cpf.ts
export function normalizeCpf(input: string): string {
  return input.replace(/\D/g, '')
}

export function isValidCpf(input: string): boolean {
  const cpf = normalizeCpf(input)
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  const calc = (base: string, factor: number) => {
    let sum = 0
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factor - i)
    const mod = (sum * 10) % 11
    return mod === 10 ? 0 : mod
  }
  const d1 = calc(cpf.slice(0, 9), 10)
  const d2 = calc(cpf.slice(0, 10), 11)
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10])
}
```

- [ ] **Step 4: Password helpers + test**

```ts
// src/lib/auth/password.ts
import bcrypt from 'bcryptjs'

const ROUNDS = 12

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
```

```ts
// src/lib/auth/password.test.ts
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('password', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('senha-forte')
    expect(await verifyPassword('senha-forte', hash)).toBe(true)
    expect(await verifyPassword('outra', hash)).toBe(false)
  })
})
```

Run: `npx vitest run src/lib/auth/cpf.test.ts src/lib/auth/password.test.ts` — expect PASS.

- [ ] **Step 5: Create `prisma.config.ts`**

```ts
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
})
```

- [ ] **Step 6: Create Prisma client singleton**

```ts
// src/lib/db/prisma.ts
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; pgPool?: Pool }

function createClient() {
  const pool = globalForPrisma.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL })
  globalForPrisma.pgPool = pool
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 7: Author `prisma/schema.prisma` (Auth + domain)**

Read and port columns from `supabase/migrations/001` + `017` + later migrations. Minimum Auth block:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model User {
  id            String    @id @default(cuid())
  cpf           String    @unique
  email         String?   @unique
  emailVerified DateTime?
  name          String?
  image         String?
  passwordHash  String
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  accounts Account[]
  sessions Session[]
  profile  Profile?
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("auth_accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

Then add CRM models mirroring DB today: `Profile` (link `userId` → `User.id`, `accountId` → tenant), `Tenant` `@@map("accounts")`, `Contact`, `Conversation`, `Message`, `WhatsappConfig` (with `wahaSession String @unique`, drop Meta phone fields), templates, pipelines, deals, broadcasts, automations, flows, api_keys, notifications, webhook_endpoints, ai_*, presence, etc.

**Rule:** Port from SQL migrations in order `001→036`; drop RLS/policy SQL; keep check constraints as Prisma enums or comments; for pgvector/FTS keep raw SQL migration file alongside Prisma.

- [ ] **Step 8: Migrate**

```bash
npx prisma migrate dev --name init_prisma_auth_crm
npx prisma generate
```

Expected: migration applied, client generated.

---

## Phase 2 — Auth.js (CPF/senha) + middleware + pages

### Task 2: Auth.js wiring

**Files:**
- Create: `src/auth.config.ts`, `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/lib/auth/bootstrap.ts`, `src/lib/auth/session.ts`
- Modify: `src/middleware.ts`
- Modify: `src/app/(auth)/login/page.tsx`, `signup/page.tsx`, `forgot-password/page.tsx`
- Modify: `src/hooks/use-auth.tsx` (wrapper over Auth.js session + profile/tenant load via API)

- [ ] **Step 1: `src/auth.config.ts`**

```ts
import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'database' },
  providers: [], // filled in auth.ts (Credentials needs Node)
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
} satisfies NextAuthConfig
```

Extend types in `src/types/next-auth.d.ts`:

```ts
import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: { id: string; name?: string | null; email?: string | null; image?: string | null }
  }
}
```

- [ ] **Step 2: `src/auth.ts` with Credentials**

```ts
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db/prisma'
import { authConfig } from '@/auth.config'
import { normalizeCpf, isValidCpf } from '@/lib/auth/cpf'
import { verifyPassword } from '@/lib/auth/password'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: 'CPF',
      credentials: {
        cpf: { label: 'CPF', type: 'text' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        const cpfRaw = String(credentials?.cpf ?? '')
        const password = String(credentials?.password ?? '')
        if (!isValidCpf(cpfRaw) || !password) return null
        const cpf = normalizeCpf(cpfRaw)
        const user = await prisma.user.findUnique({ where: { cpf } })
        if (!user?.passwordHash) return null
        const ok = await verifyPassword(password, user.passwordHash)
        if (!ok) return null
        return { id: user.id, name: user.name, email: user.email, image: user.image }
      },
    }),
  ],
})
```

- [ ] **Step 3: Route handlers**

```ts
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/auth'
export const { GET, POST } = handlers
```

- [ ] **Step 4: Bootstrap signup**

```ts
// src/lib/auth/bootstrap.ts
import { prisma } from '@/lib/db/prisma'
import { normalizeCpf, isValidCpf } from '@/lib/auth/cpf'
import { hashPassword } from '@/lib/auth/password'

export async function signupWithCpf(input: {
  cpf: string
  password: string
  name: string
  email?: string
}) {
  if (!isValidCpf(input.cpf)) throw new Error('CPF inválido')
  if (input.password.length < 8) throw new Error('Senha muito curta')
  const cpf = normalizeCpf(input.cpf)
  const passwordHash = await hashPassword(input.password)
  const email = input.email?.trim() || null

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        cpf,
        email,
        name: input.name,
        passwordHash,
      },
    })
    const tenant = await tx.tenant.create({
      data: { name: `${input.name}'s workspace` /* mirror accounts columns */ },
    })
    await tx.profile.create({
      data: {
        userId: user.id,
        accountId: tenant.id,
        fullName: input.name,
        email: email ?? `${cpf}@local.invalid`,
        role: 'owner',
      },
    })
    return { user, tenant }
  })
}
```

Adjust `tenant.create` / `profile.create` fields to match the Prisma models from Task 1 (currency defaults, etc. from mig 021).

- [ ] **Step 5: Session guards**

```ts
// src/lib/auth/session.ts
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'

const ROLE_RANK = { viewer: 0, agent: 1, admin: 2, owner: 3 } as const
export type Role = keyof typeof ROLE_RANK

export async function requireSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Response('Unauthorized', { status: 401 })
  return session
}

export async function requireAccountMember(accountId: string, minRole: Role = 'viewer') {
  const session = await requireSession()
  const profile = await prisma.profile.findFirst({
    where: { userId: session.user.id, accountId },
  })
  if (!profile) throw new Response('Forbidden', { status: 403 })
  const rank = ROLE_RANK[profile.role as Role] ?? -1
  if (rank < ROLE_RANK[minRole]) throw new Response('Forbidden', { status: 403 })
  return { session, profile }
}
```

- [ ] **Step 6: Rewrite middleware**

Replace Supabase session refresh with Auth.js:

```ts
import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'

export default NextAuth(authConfig).auth

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/whatsapp/webhook|api/auth).*)'],
}
```

Then in `authConfig.callbacks.authorized`, allow public routes (`/login`, `/signup`, `/join/*`, webhook already excluded).

- [ ] **Step 7: Update login/signup UI**

- Login form fields: CPF + senha → `signIn('credentials', { cpf, password, redirectTo: '/dashboard' })`
- Signup: call `POST /api/auth/signup` (create thin route that calls `signupWithCpf`) then `signIn`
- Forgot-password: only if email present; otherwise show message that recovery requires email

- [ ] **Step 8: Smoke auth**

```bash
npm run dev
```

Manual: signup with CPF válido → redirect → session cookie → `/dashboard` loads. Logout works.

---

## Phase 3 — Data access: Supabase → Prisma

### Task 3: Replace clients and migrate by domain

**Files:**
- Delete usage of: `src/lib/supabase/client.ts`, `server.ts`
- Replace all `createClient` / `supabaseAdmin` with `prisma` + `requireSession`
- Domains (order): auth/account → contacts → inbox → pipelines → broadcasts → settings/whatsapp_config → automations → flows → api keys/webhooks → AI → notifications/presence

- [ ] **Step 1: Inventory remaining imports**

```bash
rg -l "from '@/lib/supabase|from \"@/lib/supabase|supabaseAdmin|createBrowserClient|createServerClient" src
```

Expected: list of files to convert. Track until empty.

- [ ] **Step 2: Pattern for API routes (example contacts)**

Before (Supabase):

```ts
const supabase = await createClient()
const { data } = await supabase.from('contacts').select('*').eq('account_id', accountId)
```

After (Prisma):

```ts
import { prisma } from '@/lib/db/prisma'
import { requireAccountMember } from '@/lib/auth/session'

export async function GET(req: Request) {
  const accountId = /* from query or profile */
  await requireAccountMember(accountId)
  const contacts = await prisma.contact.findMany({ where: { accountId } })
  return Response.json({ data: contacts })
}
```

- [ ] **Step 3: Pattern for client components**

Client code must not use Prisma. Options:
1. Fetch via existing `/api/*` routes (preferred)
2. Server Components / Server Actions for reads

Convert pages that call `supabase.from(...)` in the browser to React Query/fetch against API routes, or Server Components.

- [ ] **Step 4: Reimplement former RPCs as TS**

| Old RPC | New location |
|---------|--------------|
| `peek_invitation` / `redeem_invitation` | `src/lib/auth/invitations.ts` |
| `set_member_role` / `remove_account_member` / `transfer_account_ownership` | `src/lib/auth/account.ts` |
| `touch_presence` | `src/lib/presence.ts` |
| `filter_contacts_by_tags` | `src/lib/contacts/filter-by-tags.ts` (Prisma `every`/`some`) |
| `increment_*_execution_count` | `prisma.*.update({ data: { count: { increment: 1 }}})` |
| `claim_ai_reply_slot` | transaction with conditional update |
| `match_ai_knowledge_fts` / semantic | `prisma.$queryRaw` |

- [ ] **Step 5: Typecheck gate**

```bash
npm run typecheck
npm test
```

Expected: no remaining `@supabase/*` imports; tests updated/mocked for Prisma where needed.

---

## Phase 4 — Cloudflare R2 storage

### Task 4: R2 adapter

**Files:**
- Create: `src/lib/storage/r2.ts`, `src/lib/storage/r2.test.ts` (unit with mocked S3)
- Modify: `src/lib/storage/upload-media.ts`
- Modify: profile avatar upload, chat composer, flow media forms

- [ ] **Step 1: Implement R2 client**

```ts
// src/lib/storage/r2.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

export function r2Client() {
  const accountId = required('R2_ACCOUNT_ID')
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    },
  })
}

export function publicUrl(key: string): string {
  const base = required('R2_PUBLIC_URL').replace(/\/$/, '')
  return `${base}/${key}`
}

export async function uploadObject(args: {
  key: string
  body: Buffer | Uint8Array
  contentType: string
}) {
  const client = r2Client()
  await client.send(
    new PutObjectCommand({
      Bucket: required('R2_BUCKET'),
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
    })
  )
  return publicUrl(args.key)
}

export async function deleteObject(key: string) {
  const client = r2Client()
  await client.send(
    new DeleteObjectCommand({ Bucket: required('R2_BUCKET'), Key: key })
  )
}
```

- [ ] **Step 2: Rewrite `upload-media.ts`**

Map previous bucket names to key prefixes:

```ts
export async function uploadAccountMedia(opts: {
  accountId: string
  kind: 'chat-media' | 'flow-media' | 'avatars'
  fileName: string
  body: Buffer
  contentType: string
  userId?: string
}) {
  const key =
    opts.kind === 'avatars'
      ? `avatars/${opts.userId}/${opts.fileName}`
      : `${opts.kind}/${opts.accountId}/${opts.fileName}`
  return uploadObject({ key, body: opts.body, contentType: opts.contentType })
}
```

- [ ] **Step 3: Manual smoke**

Upload avatar in Settings with real R2 credentials → public URL opens in browser.

---

## Phase 5 — Realtime SSE + NOTIFY

### Task 5: Notify helper + SSE + hooks

**Files:**
- Create: `src/lib/db/notify.ts`
- Create: `src/app/api/realtime/stream/route.ts`
- Modify: `src/hooks/use-realtime.ts`, `use-total-unread.ts`, `use-unread-notifications.ts`, `use-presence.ts`
- Modify: writers of messages/conversations/notifications/presence to call `notifyAccount`

- [ ] **Step 1: Notify helper**

```ts
// src/lib/db/notify.ts
import { prisma } from '@/lib/db/prisma'

export type RealtimePayload = {
  table: string
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  id: string
  accountId: string
}

export async function notifyAccount(payload: RealtimePayload) {
  const channel = `account_${payload.accountId.replace(/-/g, '_')}`
  await prisma.$executeRawUnsafe(
    `SELECT pg_notify($1, $2)`,
    channel,
    JSON.stringify(payload)
  )
}
```

Postgres channel names: use `[A-Za-z0-9_]` only (UUID with underscores).

- [ ] **Step 2: SSE route (Node runtime)**

```ts
// src/app/api/realtime/stream/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { Pool } from 'pg'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 })

  const url = new URL(req.url)
  const accountId = url.searchParams.get('accountId')
  if (!accountId) return new Response('accountId required', { status: 400 })

  const profile = await prisma.profile.findFirst({
    where: { userId: session.user.id, accountId },
  })
  if (!profile) return new Response('Forbidden', { status: 403 })

  const channel = `account_${accountId.replace(/-/g, '_')}`
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  await client.query(`LISTEN ${channel}`)

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()
      const send = (data: string) => controller.enqueue(enc.encode(`data: ${data}\n\n`))
      send(JSON.stringify({ type: 'ready' }))

      const onNotify = (msg: { channel: string; payload: string }) => {
        if (msg.channel === channel) send(msg.payload)
      }
      client.on('notification', onNotify)

      const ping = setInterval(() => send(JSON.stringify({ type: 'ping' })), 15000)

      req.signal.addEventListener('abort', () => {
        clearInterval(ping)
        client.removeListener('notification', onNotify)
        client.query('UNLISTEN *').finally(() => {
          client.release()
          pool.end()
          controller.close()
        })
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 3: Client hook**

Replace Supabase subscription in `use-realtime.ts` with:

```ts
useEffect(() => {
  if (!accountId) return
  const es = new EventSource(`/api/realtime/stream?accountId=${accountId}`)
  es.onmessage = (ev) => {
    const payload = JSON.parse(ev.data)
    if (payload.type === 'ping' || payload.type === 'ready') return
    // dispatch to existing handlers by payload.table
    onEvent(payload)
  }
  return () => es.close()
}, [accountId])
```

- [ ] **Step 4: Call `notifyAccount` after message insert/update** in webhook + send-message + notification creates.

- [ ] **Step 5: Smoke**

Two browsers: send message → other inbox updates without refresh.

---

## Phase 6 — WAHA adapter + webhook + Settings

### Task 6: Replace Meta transport with WAHA

**Files:**
- Create: `src/lib/whatsapp/waha-api.ts`, `waha-api.test.ts` (mock fetch)
- Modify: `send-message.ts`, `broadcast-core.ts`, `flows/meta-send.ts` → rename `waha-send.ts`, `automations/meta-send.ts`
- Rewrite: `src/app/api/whatsapp/webhook/route.ts`
- Rewrite: `src/components/settings/whatsapp-config.tsx`
- Create: `src/app/api/whatsapp/session/qr/route.ts`, `start/route.ts`, `stop/route.ts`
- Delete or gut: `meta-api.ts`, Meta signature helpers (keep phone-utils)

- [ ] **Step 1: WAHA client skeleton**

```ts
// src/lib/whatsapp/waha-api.ts
function base() {
  const u = process.env.WAHA_BASE_URL
  if (!u) throw new Error('WAHA_BASE_URL missing')
  return u.replace(/\/$/, '')
}

function headers(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.WAHA_API_KEY) h['X-Api-Key'] = process.env.WAHA_API_KEY
  return h
}

export function toChatId(e164Digits: string): string {
  const n = e164Digits.replace(/\D/g, '')
  return `${n}@c.us`
}

export async function sendText(args: {
  session: string
  chatId: string
  text: string
}): Promise<{ id: string }> {
  const res = await fetch(`${base()}/api/sendText`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`WAHA sendText ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return { id: data.id ?? data.key?.id ?? String(data.id) }
}

export async function sendImage(args: {
  session: string
  chatId: string
  file: { url: string; mimetype?: string; filename?: string }
  caption?: string
}): Promise<{ id: string }> {
  const res = await fetch(`${base()}/api/sendImage`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`WAHA sendImage ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return { id: data.id ?? data.key?.id ?? 'unknown' }
}

export async function startSession(session: string) {
  return fetch(`${base()}/api/sessions/${encodeURIComponent(session)}/start`, {
    method: 'POST',
    headers: headers(),
  })
}

export async function getQr(session: string): Promise<ArrayBuffer> {
  const res = await fetch(`${base()}/api/${encodeURIComponent(session)}/auth/qr`, {
    headers: headers(),
  })
  if (!res.ok) throw new Error(`WAHA QR ${res.status}`)
  return res.arrayBuffer()
}
```

Align exact paths with your WAHA version Swagger (`/api/screenshot`, `/api/{session}/auth/qr`, etc.) — verify against running WAHA OpenAPI before locking.

- [ ] **Step 2: Wire `send-message.ts`**

Replace `sendTextMessage` / Meta calls with `waha.sendText` / `waha.sendImage` using `whatsapp_config.wahaSession`. Persist returned id as `whatsapp_message_id`.

- [ ] **Step 3: Webhook**

```ts
// POST /api/whatsapp/webhook
export async function POST(req: Request) {
  const secret = req.headers.get('x-waha-webhook-secret')
    ?? req.headers.get('authorization')
  if (secret !== process.env.WAHA_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }
  const body = await req.json()
  // body.event: message | message.ack | session.status
  // resolve tenant by body.session === whatsapp_config.wahaSession
  // reuse existing persist + fan-out pipeline from current webhook
  return new Response('OK')
}
```

Remove Meta GET challenge handler (or keep no-op). Configure WAHA dashboard webhook URL to `{SITE}/api/whatsapp/webhook`.

- [ ] **Step 4: Settings UI**

- Fields: session name (unique), status badge, QR image from `/api/whatsapp/session/qr`, buttons Start/Stop
- Warning text: WAHA is unofficial; ban risk
- Show webhook URL copy box

- [ ] **Step 5: Smoke WAHA**

With WAHA running locally: create session → scan QR → WORKING → send text from inbox → receive reply via webhook.

---

## Phase 7 — Templates/broadcasts locais + cleanup

### Task 7: Local templates + remove Meta/Supabase

**Files:**
- Modify: template submit/sync/delete API routes
- Modify: `template-manager.tsx`, broadcast wizard
- Modify: `broadcast-core.ts` to render `{{1}}`… and `sendText`
- Remove: `@supabase/*` from `package.json`, `src/lib/supabase/`, Meta-only files
- Archive: move `supabase/migrations` → `docs/legacy/supabase-migrations` (optional)

- [ ] **Step 1: Template model semantics**

- `status`: `DRAFT | ACTIVE | ARCHIVED` (no Meta APPROVED/REJECTED sync)
- Submit API: save body/variables to DB only; if `WAHA_TEMPLATES_DRY_RUN=true`, skip nothing external (already local)
- Delete sync-from-Meta endpoint or repurpose as no-op 410

- [ ] **Step 2: Broadcast send**

```ts
function renderTemplate(body: string, params: string[]) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '')
}

// per recipient:
await sendText({
  session,
  chatId: toChatId(phone),
  text: renderTemplate(template.body, recipientParams),
})
```

- [ ] **Step 3: Remove dead packages**

```bash
npm uninstall @supabase/ssr @supabase/supabase-js
```

- [ ] **Step 4: Full verification**

```bash
npm run typecheck
npm test
npm run build
```

Expected: build green; no Meta/Supabase references (`rg -i "supabase|graph.facebook|META_APP" src` → empty).

---

## Phase 8 — Final env checklist

### Task 8: Document runbook

**Files:**
- Modify: `.env.local.example` (final)
- Ensure: `.env.local` exists with generated secrets
- Create: `docs/runbook-local.md` (short)

- [ ] **Step 1: Write runbook**

```md
# Local run
1. docker compose up -d
2. cp .env.local.example .env.local  # fill secrets
3. npx prisma migrate dev
4. Start WAHA (Docker) on WAHA_BASE_URL
5. Configure R2 bucket public access
6. npm run dev
7. Signup with CPF → Settings → WhatsApp → Start session → QR
8. Point WAHA webhook to http://localhost:3000/api/whatsapp/webhook
```

- [ ] **Step 2: Success criteria checklist** (from spec)

- [ ] App boots without Supabase/Meta env
- [ ] Signup/login CPF + password; email optional
- [ ] CRM CRUD via Prisma
- [ ] R2 upload public URL
- [ ] SSE inbox updates
- [ ] WAHA QR → send/receive
- [ ] Broadcast/template via WAHA
- [ ] Flows/automations send via WAHA

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Postgres + Prisma | Phase 1 |
| Auth.js CPF/senha, email optional | Phase 2 |
| App-layer authz, no RLS | Phase 2–3 |
| R2 storage | Phase 4 |
| SSE + LISTEN/NOTIFY | Phase 5 |
| WAHA 1 session/account | Phase 6 |
| Templates/broadcasts local | Phase 7 |
| Env example + `.env.local` | Phase 0 + 8 |
| Remove Supabase/Meta | Phase 7 |
| Greenfield (no data migration) | Assumed throughout |

**Placeholder scan:** none intentional. WAHA exact QR/start paths must be confirmed against the deployed WAHA Swagger in Phase 6 Step 1.

**Type consistency:** `Tenant` `@@map("accounts")`; Auth.js `Account` `@@map("auth_accounts")`; `wahaSession` on `WhatsappConfig`; `notifyAccount` payload shape shared by SSE client.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-15-prisma-waha-migration.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
