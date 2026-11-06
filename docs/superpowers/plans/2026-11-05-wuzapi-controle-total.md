# WuzAPI controle total Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o caminho operacional Evolution pela WuzAPI com criação de instâncias no painel, chat em tempo real (SSE), importação de nomes/fotos, CRUD de contatos no CRM e blacklist sincronizada com o WhatsApp.

**Architecture:** Um transporte por conta (`WhatsappProvider`). Admin WuzAPI (`WUZAPI_ADMIN_TOKEN`, alias `WUZAPI_API_KEY`) cria/lista/apaga usuários-instância; o token do usuário fica criptografado em `whatsapp_config.encrypted_credential`. Envio e webhook escolhem o adaptador pela conta. Eventos normalizados alimentam `inbound` + `notifyAccount` + SSE existente. Contatos e blacklist são fonte da verdade no CRM, com mirror no WuzAPI quando a conta está em WUZAPI.

**Tech Stack:** Next.js 16 App Router, Prisma na raiz, Vitest, Postgres, WuzAPI Juspilot (`info.version` 3.0.0; header user `token`, admin `Authorization`).

## Global Constraints

- Um app Next na raiz. Domínio em `src/domain`. Sem Nest, Turborepo, `apps/api`, `src/server`, Supabase.
- ADR-007 e ADR-004: um serviço Dokploy; Evolution permanece só para contas existentes/rollback.
- Credenciais nunca vão ao cliente, logs ou URLs.
- Endpoints de usuário WuzAPI: header `token`. Admin: header `Authorization`.
- Webhook público: `POST /webhook/whatsapp` (já encaminha) e `/api/whatsapp/webhook`.
- `nameLocked === true` → push name / importação não sobrescreve o nome.
- Contato com `blockedAt != null` não recebe envio do inbox nem resposta automática.
- Testes: `pnpm exec vitest run <arquivo>`.
- Ao adicionar `blockedAt` no Contact, subir `PRISMA_SCHEMA_VERSION` de `6` para `7` em `src/domain/db/prisma.ts`.
- Não commitar `.env`. Documentar `WUZAPI_ADMIN_TOKEN` em `.env.example` (alias documentado para `WUZAPI_API_KEY`).

## File map

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/domain/whatsapp/wuzapi-api.ts` | Transporte user (token header) |
| `src/domain/whatsapp/wuzapi-admin.ts` | Admin: create/list/delete users |
| `src/domain/whatsapp/wuzapi-event.ts` | Parse webhook → eventos internos |
| `src/domain/whatsapp/resolve-transport.ts` | Escolhe Evolution vs WuzAPI por conta |
| `src/domain/whatsapp/send-message.ts` | Envia via transporte da conta |
| `src/domain/whatsapp/ensure-contact-avatar.ts` | Avatar via WuzAPI `/user/avatar` |
| `src/domain/whatsapp/import-contacts.ts` | Importa nomes de `/user/contacts` |
| `src/domain/whatsapp/blacklist.ts` | block/unblock + persistência |
| `src/app/api/whatsapp/config/route.ts` | CRUD config + create instance |
| `src/app/api/whatsapp/session/route.ts` | QR/status WuzAPI |
| `src/app/api/whatsapp/webhook/route.ts` | Dual provider ingest |
| `src/components/settings/whatsapp-config.tsx` | UI instância/QR/status |
| `prisma/schema.prisma` | `Contact.blockedAt` |

## Baseline já no working tree (não recriar)

Já existem (podem estar incompletos): `transport.ts`, `wuzapi-api.ts`, `wuzapi-event.ts`, `webhook-url.ts`, `prisma/whatsapp-credential.ts`, migrations `20261105000000`–`0003`, ADR-007, rota `/webhook/whatsapp`. Task 1+ corrigem e ligam; não apagar esse baseline.

---

### Task 1: Contrato Juspilot no transporte user

**Files:**
- Modify: `src/domain/whatsapp/wuzapi-api.ts`
- Modify: `src/domain/whatsapp/wuzapi-api.test.ts`
- Modify: `.env.example` (documentar admin token; não remover entradas WuzAPI)

**Interfaces:**
- Consumes: `WhatsAppTransport`, `wuzapiWebhookUrl()`
- Produces: `WuzapiTransport` autenticando com header `token`; `connect()` registra webhook com corpo `{ webhook, events: ['Message','ReadReceipt'] }` (ou o formato que a instalação aceitar) e verifica o GET

- [ ] **Step 1: Write the failing test**

Em `wuzapi-api.test.ts`, garantir um caso que falha com o código atual (Authorization):

```ts
it('sends the user token in the token header', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: { connected: true, loggedIn: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  const client = new WuzapiTransport({ baseUrl: 'https://wuz.example/api', token: 'user-secret', fetcher })
  await client.status()
  const init = fetcher.mock.calls[0][1] as RequestInit
  const headers = new Headers(init.headers)
  expect(headers.get('token')).toBe('user-secret')
  expect(headers.get('Authorization')).toBeNull()
})

it('registers webhook with webhook + events and verifies readback', async () => {
  vi.stubEnv('WUZAPI_WEBHOOK_URL', 'https://app.example/webhook/whatsapp')
  const calls: Array<{ path: string; body?: unknown; headers: Headers }> = []
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname.replace(/^\/api/, '') || new URL(url).pathname
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ path: new URL(url).pathname, body, headers: new Headers(init?.headers) })
    if (init?.method === 'POST' && String(url).includes('/webhook')) {
      return new Response(JSON.stringify({ success: true, data: { WebhookURL: 'https://app.example/webhook/whatsapp', Events: ['Message', 'ReadReceipt'] } }), { status: 200 })
    }
    if (String(url).includes('/webhook')) {
      return new Response(JSON.stringify({ success: true, data: { webhook: 'https://app.example/webhook/whatsapp', subscribe: ['Message', 'ReadReceipt'] } }), { status: 200 })
    }
    return new Response(JSON.stringify({ success: true, data: { details: 'Connected!' } }), { status: 200 })
  })
  await new WuzapiTransport({ baseUrl: 'https://wuz.example', token: 't', fetcher }).connect()
  const setCall = calls.find((c) => c.body && typeof c.body === 'object' && c.body !== null)
  expect(setCall?.body).toMatchObject({ webhook: 'https://app.example/webhook/whatsapp' })
})
```

Ajuste paths se o `baseUrl` já incluir `/api` — o assert importante é o header `token` e o corpo com `webhook`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/whatsapp/wuzapi-api.test.ts`

Expected: FAIL — header atual é `Authorization`.

- [ ] **Step 3: Write minimal implementation**

Em `request()`, trocar headers para:

```ts
headers: {
  token: this.token,
  'Content-Type': 'application/json',
  ...(operationId ? { 'X-Correlation-ID': operationId } : {}),
},
```

Em `connect()`:

```ts
async connect(): Promise<void> {
  const url = wuzapiWebhookUrl()
  if (!url) throw new WhatsAppTransportError('configuration', 'WuzAPI webhook URL is missing')
  await this.request('/webhook', { webhook: url, events: ['Message', 'ReadReceipt'] }, undefined, true)
  const configured = await this.request('/webhook')
  const readback = typeof configured.webhook === 'string' ? configured.webhook : null
  if (readback !== url) throw new WhatsAppTransportError('configuration', 'WuzAPI webhook verification failed')
  await this.request('/session/connect', { Subscribe: ['Message', 'ReadReceipt'], Immediate: true }, undefined, true)
}
```

Se testes de contrato existentes (`tests/acceptance/juspilot-contract.test.ts`) assertarem `Authorization` ou `webhookURL`, atualizá-los para o contrato Juspilot.

Em `.env.example`, adicionar:

```dotenv
# Token admin da instalação WuzAPI (criar/listar/apagar usuários). Aceita alias WUZAPI_API_KEY.
WUZAPI_ADMIN_TOKEN=
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/whatsapp/wuzapi-api.test.ts tests/acceptance/juspilot-contract.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/whatsapp/wuzapi-api.ts src/domain/whatsapp/wuzapi-api.test.ts tests/acceptance/juspilot-contract.test.ts .env.example
git commit -m "$(cat <<'EOF'
fix: align WuzAPI user transport with Juspilot token auth

EOF
)"
```

---

### Task 2: Cliente admin — criar/listar/apagar instâncias

**Files:**
- Create: `src/domain/whatsapp/wuzapi-admin.ts`
- Create: `src/domain/whatsapp/wuzapi-admin.test.ts`

**Interfaces:**
- Consumes: `WUZAPI_BASE_URL`, `WUZAPI_ADMIN_TOKEN` || `WUZAPI_API_KEY`
- Produces:
  - `adminTokenFromEnv(): string`
  - `class WuzapiAdmin { createUser(input: { name: string; token: string; webhook?: string }): Promise<{ id: string; name: string; token: string }>; listUsers(): Promise<Array<{ id: string; name: string; token: string; connected?: boolean; loggedIn?: boolean }>>; deleteUser(id: string, full?: boolean): Promise<void> }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { WuzapiAdmin, adminTokenFromEnv } from './wuzapi-admin'

describe('adminTokenFromEnv', () => {
  it('prefers WUZAPI_ADMIN_TOKEN over WUZAPI_API_KEY', () => {
    vi.stubEnv('WUZAPI_ADMIN_TOKEN', 'admin')
    vi.stubEnv('WUZAPI_API_KEY', 'legacy')
    expect(adminTokenFromEnv()).toBe('admin')
  })
  it('falls back to WUZAPI_API_KEY', () => {
    vi.stubEnv('WUZAPI_ADMIN_TOKEN', '')
    vi.stubEnv('WUZAPI_API_KEY', 'legacy')
    expect(adminTokenFromEnv()).toBe('legacy')
  })
})

describe('WuzapiAdmin', () => {
  it('creates a user with Authorization admin header', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: { id: 'uid-1', name: 'Acme', token: 'tok-1' },
      }), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    )
    const admin = new WuzapiAdmin({ baseUrl: 'https://wuz.example/api', adminToken: 'adm', fetcher })
    const user = await admin.createUser({ name: 'Acme', token: 'tok-1', webhook: 'https://app.example/webhook/whatsapp' })
    expect(user).toEqual({ id: 'uid-1', name: 'Acme', token: 'tok-1' })
    const headers = new Headers(fetcher.mock.calls[0][1].headers)
    expect(headers.get('Authorization')).toBe('adm')
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toMatchObject({
      name: 'Acme',
      token: 'tok-1',
      webhook: 'https://app.example/webhook/whatsapp',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/whatsapp/wuzapi-admin.test.ts`

Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
import { WhatsAppTransportError } from './transport'

export function adminTokenFromEnv(): string {
  const token = (process.env.WUZAPI_ADMIN_TOKEN || process.env.WUZAPI_API_KEY || '').trim()
  if (!token) throw new WhatsAppTransportError('configuration', 'WuzAPI admin token is missing')
  return token
}

export class WuzapiAdmin {
  private readonly base: string
  private readonly adminToken: string
  private readonly fetcher: typeof fetch
  private readonly timeoutMs: number

  constructor(options?: { baseUrl?: string; adminToken?: string; fetcher?: typeof fetch; timeoutMs?: number }) {
    const raw = options?.baseUrl ?? process.env.WUZAPI_BASE_URL
    try {
      const url = new URL(raw || '')
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
      this.base = url.toString().replace(/\/$/, '')
    } catch {
      throw new WhatsAppTransportError('configuration', 'Invalid WUZAPI_BASE_URL')
    }
    this.adminToken = (options?.adminToken ?? adminTokenFromEnv()).trim()
    this.fetcher = options?.fetcher ?? fetch
    this.timeoutMs = options?.timeoutMs ?? 15000
  }

  private async request(path: string, init?: { method?: string; body?: object }): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetcher(`${this.base}${path}`, {
        method: init?.method ?? (init?.body ? 'POST' : 'GET'),
        headers: { Authorization: this.adminToken, 'Content-Type': 'application/json' },
        body: init?.body ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      })
      const json = await response.json() as { success?: boolean; data?: unknown }
      if (!response.ok || json.success !== true) {
        throw new WhatsAppTransportError(
          response.status === 401 || response.status === 403 ? 'authentication' : 'provider',
          `WuzAPI admin HTTP ${response.status}`,
        )
      }
      return json.data
    } finally {
      clearTimeout(timer)
    }
  }

  async createUser(input: { name: string; token: string; webhook?: string }) {
    const data = await this.request('/admin/users', {
      method: 'POST',
      body: { name: input.name, token: input.token, ...(input.webhook ? { webhook: input.webhook } : {}), events: 'All' },
    }) as { id: string; name: string; token: string }
    if (!data?.id || !data.token) throw new WhatsAppTransportError('invalid_response', 'Invalid create user response')
    return { id: data.id, name: data.name, token: data.token }
  }

  async listUsers() {
    const data = await this.request('/admin/users')
    const rows = Array.isArray(data) ? data : []
    return rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      token: String(row.token ?? ''),
      connected: typeof row.connected === 'boolean' ? row.connected : undefined,
      loggedIn: typeof row.loggedIn === 'boolean' ? row.loggedIn : undefined,
    }))
  }

  async deleteUser(id: string, full = true) {
    await this.request(`/admin/users/${encodeURIComponent(id)}${full ? '/full' : ''}`, { method: 'DELETE' })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/whatsapp/wuzapi-admin.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/whatsapp/wuzapi-admin.ts src/domain/whatsapp/wuzapi-admin.test.ts
git commit -m "$(cat <<'EOF'
feat: add WuzAPI admin client for instance users

EOF
)"
```

---

### Task 3: Resolver transporte por conta e enviar texto via WuzAPI

**Files:**
- Create: `src/domain/whatsapp/resolve-transport.ts`
- Create: `src/domain/whatsapp/resolve-transport.test.ts`
- Modify: `src/domain/whatsapp/send-message.ts` (somente ramo texto primeiro; mídia pode continuar Evolution se a conta for Evolution)
- Test: estender ou criar `src/domain/whatsapp/send-message.wuzapi.test.ts`

**Interfaces:**
- Consumes: `readWhatsappCredential(accountId)`, `WuzapiTransport`, `WhatsappConfig.provider`
- Produces: `async function resolveWhatsAppTransport(accountId: string): Promise<{ provider: 'EVOLUTION' | 'WUZAPI'; session: string; sendText: (to: string, text: string, operationId: string) => Promise<{ remoteId: string }> }>`  
  Para Evolution, adaptar as funções existentes de `evolution-api.ts` sem reescrevê-las.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  readCred: vi.fn(),
}))

vi.mock('@/domain/db/prisma', () => ({
  prisma: { whatsappConfig: { findUnique: mocks.findUnique } },
}))
vi.mock('@/domain/whatsapp/encryption', () => ({}))
vi.mock('../../prisma/whatsapp-credential', () => ({
  readWhatsappCredential: mocks.readCred,
}))

// Ajuste o path do mock de credential para o import real usado em resolve-transport.

describe('resolveWhatsAppTransport', () => {
  beforeEach(() => {
    mocks.findUnique.mockReset()
    mocks.readCred.mockReset()
  })

  it('builds a WuzapiTransport when provider is WUZAPI', async () => {
    mocks.findUnique.mockResolvedValue({
      accountId: 'acc',
      provider: 'WUZAPI',
      wahaSession: 'unused',
      providerSessionId: 'wuz-user-1',
      status: 'WORKING',
    })
    mocks.readCred.mockResolvedValue('user-token')
    const { resolveWhatsAppTransport } = await import('./resolve-transport')
    const transport = await resolveWhatsAppTransport('acc')
    expect(transport.provider).toBe('WUZAPI')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/whatsapp/resolve-transport.test.ts`

Expected: FAIL — arquivo ausente.

- [ ] **Step 3: Write minimal implementation**

`resolve-transport.ts`:

```ts
import 'server-only'
import { prisma } from '@/domain/db/prisma'
import { readWhatsappCredential } from '../../../prisma/whatsapp-credential'
import { WuzapiTransport } from './wuzapi-api'
import { sendText as evolutionSendText } from './evolution-api'
import { WhatsAppTransportError } from './transport'

export async function resolveWhatsAppTransport(accountId: string) {
  const config = await prisma.whatsappConfig.findUnique({ where: { accountId } })
  if (!config) throw new WhatsAppTransportError('configuration', 'WhatsApp not configured')
  if (config.provider === 'WUZAPI') {
    const token = await readWhatsappCredential(accountId)
    if (!token) throw new WhatsAppTransportError('configuration', 'WuzAPI account token is missing')
    const client = new WuzapiTransport({ token })
    return {
      provider: 'WUZAPI' as const,
      session: config.providerSessionId ?? config.wahaSession,
      async sendText(to: string, text: string, operationId: string) {
        const result = await client.sendText({ to, text, operationId })
        return { remoteId: result.remoteId }
      },
      client,
    }
  }
  return {
    provider: 'EVOLUTION' as const,
    session: config.wahaSession,
    async sendText(to: string, text: string, _operationId: string) {
      const remoteId = await evolutionSendText(config.wahaSession, to, text)
      return { remoteId: String(remoteId) }
    },
  }
}
```

Ajuste a assinatura de `evolutionSendText` ao export real. Em `send-message.ts`, no ponto que chama `sendText` da Evolution para `messageType === 'text'`, usar `resolveWhatsAppTransport(accountId)` e `transport.sendText(...)`. Manter mídia/interactive no caminho Evolution se a conta for Evolution; se WUZAPI e tipo não-texto ainda não suportado neste task, lançar `SendMessageError('unsupported', ..., 400)` claro.

Gerar `operationId` estável (uuid) antes do envio e gravar no message local como hoje.

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run src/domain/whatsapp/resolve-transport.test.ts src/domain/whatsapp/wuzapi-api.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/whatsapp/resolve-transport.ts src/domain/whatsapp/resolve-transport.test.ts src/domain/whatsapp/send-message.ts
git commit -m "$(cat <<'EOF'
feat: route text sends through the account WhatsApp transport

EOF
)"
```

---

### Task 4: Webhook WuzAPI → inbound + SSE

**Files:**
- Modify: `src/app/api/whatsapp/webhook/route.ts`
- Modify: `src/app/api/whatsapp/webhook/route.test.ts`
- Create se necessário: `src/domain/whatsapp/wuzapi-webhook-auth.ts` + test

**Interfaces:**
- Consumes: `parseWuzapiWebhook`, `ingestWahaMessage` (ou adaptador fino que mapeia `WuzapiEvent` → payload do ingest), `notifyAccount`
- Produces: POST dual-provider: se header/credencial indicar WuzAPI (ex.: `token` de conta batendo com `encrypted_credential` decifrado, ou header acordado), processa WuzAPI; senão Evolution como hoje
- Identificação da conta: preferir `instance`/`userID`/`token` verificável no body/header; rejeitar se `config.provider !== 'WUZAPI'`

- [ ] **Step 1: Write the failing test**

Estender `webhook/route.test.ts`:

```ts
it('ingests a WuzAPI message for a WUZAPI account and notifies', async () => {
  // mock config provider WUZAPI + credential match
  // POST body estilo parseWuzapiWebhook message
  // expect ingest chamado 1x e status 200
})
```

Use um payload mínimo que `parseWuzapiWebhook` já cobre nos testes de `wuzapi-event.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/api/whatsapp/webhook/route.test.ts`

Expected: FAIL — rota só Evolution.

- [ ] **Step 3: Write minimal implementation**

Fluxo sugerido no POST:

1. Ler `rawBody` (já existe).
2. Se `evolutionWebhookAuthorized(req)` e instance Evolution → caminho atual.
3. Senão, tentar auth WuzAPI: header `token` igual ao credential de alguma conta WUZAPI (comparação em memória só de contas WUZAPI ativas; usar timing-safe equal). Alternativa aceitável se a instalação assinar HMAC: verificar `x-hmac-signature` quando configurado.
4. `parseWuzapiWebhook(body)`.
5. Mapear `message`/`send-echo` para o formato esperado por `ingestWahaMessage` **ou** chamar um `ingestWuzapiEvent` fino que reutilize a persistência existente.
6. Em `receipt`, chamar `ingestWahaAck` com status mapeado.
7. Em `connection`, atualizar `whatsapp_config.status` (`WORKING` / `STOPPED` / `STARTING`) e `notifyAccount`.
8. Persistir antes do 2xx. Não logar body/token.

Atualizar `webhook_url` retornado na config para `/webhook/whatsapp` quando WuzAPI.

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run src/app/api/whatsapp/webhook/route.test.ts src/domain/whatsapp/wuzapi-event.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/whatsapp/webhook/route.ts src/app/api/whatsapp/webhook/route.test.ts src/domain/whatsapp/wuzapi-webhook-auth.ts src/domain/whatsapp/wuzapi-webhook-auth.test.ts
git commit -m "$(cat <<'EOF'
feat: ingest WuzAPI webhooks into the shared inbound path

EOF
)"
```

---

### Task 5: Config API + UI — criar instância, QR, status

**Files:**
- Modify: `src/app/api/whatsapp/config/route.ts`
- Modify: `src/app/api/whatsapp/session/route.ts`
- Modify: `src/components/settings/whatsapp-config.tsx`
- Test: `src/app/api/whatsapp/config/route.test.ts` (criar se não existir)

**Interfaces:**
- POST `/api/whatsapp/config` body: `{ provider: 'WUZAPI' | 'EVOLUTION', display_name?: string, waha_session?: string }`
  - Se `WUZAPI` e ainda sem credential: `crypto.randomBytes(24).toString('base64url')` como token user; `WuzapiAdmin.createUser({ name, token, webhook })`; `storeWhatsappCredential`; salvar `provider=WUZAPI`, `providerSessionId=user.id`, `wahaSession` único estável (ex. `wuz_${accountId.slice(0,8)}_${user.id.slice(0,8)}`).
  - Depois `new WuzapiTransport({ token }).connect()` best-effort.
- GET session/QR: se WUZAPI, `client.qr()` — se data-URL/base64, devolver `image/png` ou JSON `{ qr }` conforme a UI; se Evolution, caminho atual.
- UI: seletor de provedor; botão “Criar instância WuzAPI”; status connected/loggedIn; QR; desconectar.

- [ ] **Step 1: Write the failing test**

```ts
it('creates a WuzAPI user instance and stores the encrypted token', async () => {
  // mock admin.createUser, storeWhatsappCredential, prisma upsert
  // POST { provider: 'WUZAPI', display_name: 'Loja' }
  // expect provider WUZAPI and storeWhatsappCredential called once
})
```

- [ ] **Step 2: Run to fail**

Run: `pnpm exec vitest run src/app/api/whatsapp/config/route.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement routes + UI mínima**

Manter textos em PT-BR. Não expor token na resposta JSON. Em `DELETE`, se provider WUZAPI e `providerSessionId`, chamar `admin.deleteUser(id, true)` best-effort e limpar credential.

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run src/app/api/whatsapp/config/route.test.ts src/domain/whatsapp/wuzapi-admin.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/whatsapp/config/route.ts src/app/api/whatsapp/config/route.test.ts src/app/api/whatsapp/session/route.ts src/components/settings/whatsapp-config.tsx
git commit -m "$(cat <<'EOF'
feat: create and connect WuzAPI instances from settings

EOF
)"
```

---

### Task 6: Importar contatos (nome) e fotos

**Files:**
- Create: `src/domain/whatsapp/import-contacts.ts`
- Create: `src/domain/whatsapp/import-contacts.test.ts`
- Modify: `src/domain/whatsapp/ensure-contact-avatar.ts`
- Modify: `src/domain/whatsapp/wuzapi-api.ts` — métodos `listContacts()` e `avatar(phone: string, preview: boolean)`
- Modify: rota de sync existente `src/app/api/whatsapp/sync/route.ts` **ou** criar `POST /api/whatsapp/contacts/import`

**Interfaces:**
- `WuzapiTransport.listContacts(): Promise<Array<{ phone: string; name: string | null }>>`
- `WuzapiTransport.avatar(phone: string, preview?: boolean): Promise<string | null>` — URL ou data-URL retornada pela API
- `importWuzapiContacts(accountId: string): Promise<{ created: number; updated: number; skipped: number }>`
  - Upsert por `phoneNormalized` na conta
  - Só preenche `name` se `!nameLocked` e nome atual vazio **ou** nome veio do WhatsApp e não travado (não sobrescrever `nameLocked`)
  - Chama `ensureContactAvatar` após criar/atualizar

- [ ] **Step 1: Write failing tests** for list/parse + nameLocked skip

- [ ] **Step 2: Run to fail**

- [ ] **Step 3: Implement** `GET /user/contacts` e `POST /user/avatar` no transporte; import; trocar WAHA em `ensure-contact-avatar` para usar `resolveWhatsAppTransport` / avatar WuzAPI quando provider WUZAPI (Evolution/WAHA legacy: manter comportamento atual se ainda houver helper, senão no-op seguro)

- [ ] **Step 4: Run** `pnpm exec vitest run src/domain/whatsapp/import-contacts.test.ts src/domain/whatsapp/wuzapi-api.test.ts`

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: import WuzAPI contact names and avatars

EOF
)"
```

---

### Task 7: Blacklist + bloquear envio/agente

**Files:**
- Modify: `prisma/schema.prisma` — `blockedAt DateTime? @map("blocked_at")` em `Contact`
- Create: `prisma/migrations/20261106000000_contact_blocked_at/migration.sql`
- Modify: `src/domain/db/prisma.ts` — `PRISMA_SCHEMA_VERSION = 7`
- Create: `src/domain/whatsapp/blacklist.ts` + test
- Modify: `src/domain/whatsapp/send-message.ts` — rejeitar se `contact.blockedAt`
- Modify: agent plan path — não responder se bloqueado
- Create: `src/app/api/contacts/[id]/block/route.ts` (POST block, DELETE unblock)
- UI mínima: botão Bloquear/Desbloquear na ficha do contato (arquivo de detalhe existente)

**Interfaces:**
- `blockContact(accountId, contactId): Promise<void>` — set `blockedAt=now()`, se WUZAPI chama `POST /user/block` com `{ Phone }`
- `unblockContact(...)` — clear `blockedAt`, `POST /user/unblock`
- Envio: `SendMessageError('blocked', 'Contato na blacklist', 403)`

- [ ] **Step 1: Failing tests** for block persistence + send rejection

- [ ] **Step 2: Run to fail**

- [ ] **Step 3: Migration + domain + routes + guard no send/agent**

```sql
ALTER TABLE "contacts" ADD COLUMN "blocked_at" TIMESTAMP(3);
```

- [ ] **Step 4: Run** `pnpm exec vitest run src/domain/whatsapp/blacklist.test.ts` (+ send test se existir)

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: sync contact blacklist with WuzAPI and block sends

EOF
)"
```

---

### Task 8: Remover contato + smoke realtime

**Files:**
- Verificar DELETE de contato existente em `src/app/api/contacts/`; se não remove conversas com cascade adequado, ajustar conforme schema (Conversation → Contact)
- Modify: docs curtas em `docs/runbook-local.md` — fluxo criar instância WuzAPI com `WUZAPI_ADMIN_TOKEN`
- Append: `docs/session-log.md`

**Aceite desta task:**
- DELETE contato remove do CRM (e não quebra inbox)
- Com conta WUZAPI: mensagem inbound de teste (fixture) gera `notifyAccount` (já coberto na task 4); confirmar que `use-realtime` / stream não foram regressados — rodar `pnpm exec vitest run src/app/api/realtime/stream/route.test.ts src/app/api/realtime/stream/use-realtime.test.ts` se existirem

- [ ] **Step 1: Write/adjust test** for contact delete + blocked contact ignored by agent if missing

- [ ] **Step 2–4: Implement gaps, run realtime tests, update runbook + session-log**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: document WuzAPI instance flow and verify realtime tests

EOF
)"
```

---

## Self-review checklist

1. **Spec coverage (pedido do usuário):** instâncias ✓ (T2/T5), rapidez/SSE ✓ (T4/T8), fotos/nomes ✓ (T6), salvar/remover contatos ✓ (T6/T8), blacklist ✓ (T7), enviar/receber realtime ✓ (T3/T4).
2. **Placeholders:** nenhum TBD; paths e assinaturas explícitas.
3. **Tipos:** `provider` enum Prisma; header `token` vs `Authorization` consistentes entre tasks.

## Out of scope deste plano

- Medição formal p50/p95 de 100 textos (fica no plano de produto maior).
- Migrar automaticamente todas as contas Evolution em produção.
- Templates oficiais Meta / áudio Opus ponta a ponta (Evolution continua para contas antigas; áudio WuzAPI pode seguir em plano seguinte).
