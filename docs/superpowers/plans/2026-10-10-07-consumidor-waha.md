# Consumidor de eventos do WAHA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O processo do Next assina os eventos da instância WAHA quando o webhook público não basta. O navegador continua no SSE do próprio app. A chave do WAHA não vai para o browser.

**Architecture:** Um módulo único sobe com o servidor (`src/instrumentation.ts`), uma conexão por sessão `WhatsappConfig`, com reconnect. O transporte é o que a sonda cravar: SSE se a instância responder `text/event-stream`, senão WebSocket em `/ws`. Os eventos `message` e `message.any` entram no `ingestWahaMessage` que já deduplica por id. Webhook e consumidor juntos não duplicam bolha por causa dessa chave.

**Tech Stack:** Next.js 16 instrumentation, `fetch`, WebSocket global do Node 22, WAHA `WAHA_BASE_URL` + `WAHA_API_KEY`.

## Global Constraints

- ADR 004: o consumidor mora no processo do Next. Proibido segundo Dockerfile, segundo serviço Dokploy ou worker separado.
- O consumidor só liga quando `WAHA_EVENT_CONSUMER=1` e `WAHA_BASE_URL` está definido. Fora isso, `register()` retorna sem abrir socket. `next build` não abre socket (`NEXT_PHASE === 'phase-production-build'` também retorna).
- Eventos assinados: `message`, `message.any`, `message.ack`, `session.status`.
- `message` e `message.any` chamam `ingestWahaMessage`. `message.ack` chama o ingest de ack que já existe (`ingestWahaAck` em `src/domain/whatsapp/ack.ts`). `session.status` atualiza `WhatsappConfig.status` da sessão.
- Dedupe continua sendo a de `findExistingMessage` por `message_id`. Não criar outra tabela de dedupe.
- A sonda escreve o resultado em `docs/superpowers/notes/2026-10-10-waha-transport.md` e não altera produto.
- Se a sonda não conseguir autenticar na instância, parar e pedir a URL. Não inventar que existe SSE.
- Node com `WebSocket` global (22+). Se o runtime não tiver, a tarefa do socket falha com a mensagem `WebSocket global missing` em vez de adicionar dependência.

---

### Task 1: Sonda do transporte

**Files:**
- Create: `src/domain/whatsapp/waha-transport.ts`
- Test: `src/domain/whatsapp/waha-transport.test.ts`
- Create: `scripts/probe-waha-transport.ts`

**Interfaces:**
- Produces: `classifyWahaTransport(sample: { eventsContentType: string | null; eventsStatus: number }): 'sse' | 'websocket'`

Regra: status 200 e content-type contendo `text/event-stream` → `'sse'`. Qualquer outro caso → `'websocket'`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { classifyWahaTransport } from './waha-transport'

describe('classifyWahaTransport', () => {
  it('picks sse only when the events response is an event stream', () => {
    expect(
      classifyWahaTransport({
        eventsStatus: 200,
        eventsContentType: 'text/event-stream; charset=utf-8',
      }),
    ).toBe('sse')
  })

  it('falls back to websocket otherwise', () => {
    expect(
      classifyWahaTransport({ eventsStatus: 404, eventsContentType: null }),
    ).toBe('websocket')
    expect(
      classifyWahaTransport({
        eventsStatus: 200,
        eventsContentType: 'application/json',
      }),
    ).toBe('websocket')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/whatsapp/waha-transport.test.ts`

Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
export function classifyWahaTransport(sample: {
  eventsContentType: string | null
  eventsStatus: number
}): 'sse' | 'websocket' {
  if (
    sample.eventsStatus === 200 &&
    (sample.eventsContentType ?? '').includes('text/event-stream')
  ) {
    return 'sse'
  }
  return 'websocket'
}

export function wahaEventsUrl(baseUrl: string, session: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return `${base}/api/${encodeURIComponent(session)}/events`
}

export function wahaWebSocketUrl(baseUrl: string, session: string): string {
  const base = baseUrl.replace(/\/$/, '').replace(/^http/i, 'ws')
  const events = 'message,message.any,message.ack,session.status'
  return `${base}/ws?session=${encodeURIComponent(session)}&events=${events}`
}
```

`scripts/probe-waha-transport.ts` (rodar com `pnpm exec tsx scripts/probe-waha-transport.ts`):

1. Lê `WAHA_BASE_URL`, `WAHA_API_KEY` e a primeira `WhatsappConfig.wahaSession` via Prisma. Se faltar env, imprime o que falta e sai com código 1.
2. `GET wahaEventsUrl` com header `X-Api-Key` e `Accept: text/event-stream`, `AbortSignal.timeout(2000)`.
3. `classifyWahaTransport` com o status e o content-type (em erro de rede, status 0 e content-type null).
4. Escreve `docs/superpowers/notes/2026-10-10-waha-transport.md` com a data, a session, o status HTTP, o content-type e a linha `Transporte: sse` ou `Transporte: websocket`.
5. Aborta o body imediatamente depois de ler os headers. Não deixa o stream aberto.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/whatsapp/waha-transport.test.ts`

Expected: PASS

Depois, com a instância acessível: `pnpm exec tsx scripts/probe-waha-transport.ts`.

Expected: o markdown da nota existe e diz `sse` ou `websocket`. Se sair código 1 por env ausente, registrar isso na nota e parar o plano 7 até o humano apontar a instância. Não seguir para a Task 2 no escuro.

- [ ] **Step 5: Commit**

```bash
git add src/domain/whatsapp/waha-transport.ts src/domain/whatsapp/waha-transport.test.ts scripts/probe-waha-transport.ts docs/superpowers/notes/2026-10-10-waha-transport.md
git commit -m "docs: record whether WAHA exposes an event stream"
```

---

### Task 2: Loop de uma sessão

**Files:**
- Create: `src/domain/whatsapp/waha-event-consumer.ts`
- Test: `src/domain/whatsapp/waha-event-consumer.test.ts`

**Interfaces:**
- Consumes: `classifyWahaTransport`, `wahaEventsUrl`, `wahaWebSocketUrl`, `ingestWahaMessage`, `ingestWahaAck`
- Produces:
  - `parseWahaEventData(raw: string): { event: string; payload: unknown; session: string | null } | null`
  - `consumerEnabled(env: { WAHA_EVENT_CONSUMER?: string; WAHA_BASE_URL?: string; NEXT_PHASE?: string }): boolean`

`parseWahaEventData`: JSON com `event` string. `payload` é o resto do objeto ou o campo `payload`. `session` é string se vier, senão null. JSON inválido ou sem `event` → null.

`consumerEnabled`: true só quando `WAHA_EVENT_CONSUMER === '1'`, `WAHA_BASE_URL` não vazio, e `NEXT_PHASE` não é `phase-production-build`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { consumerEnabled, parseWahaEventData } from './waha-event-consumer'

describe('parseWahaEventData', () => {
  it('reads event, session and payload', () => {
    expect(
      parseWahaEventData(
        JSON.stringify({
          event: 'message',
          session: 'default',
          payload: { from: '5511999999999@c.us', body: 'oi' },
        }),
      ),
    ).toEqual({
      event: 'message',
      session: 'default',
      payload: { from: '5511999999999@c.us', body: 'oi' },
    })
  })

  it('returns null for malformed data', () => {
    expect(parseWahaEventData('nope')).toBeNull()
    expect(parseWahaEventData('{}')).toBeNull()
  })
})

describe('consumerEnabled', () => {
  it('is on only for an explicit flag, a base url, and not during build', () => {
    expect(
      consumerEnabled({
        WAHA_EVENT_CONSUMER: '1',
        WAHA_BASE_URL: 'https://waha.example',
      }),
    ).toBe(true)
    expect(
      consumerEnabled({
        WAHA_EVENT_CONSUMER: '1',
        WAHA_BASE_URL: 'https://waha.example',
        NEXT_PHASE: 'phase-production-build',
      }),
    ).toBe(false)
    expect(
      consumerEnabled({ WAHA_BASE_URL: 'https://waha.example' }),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/domain/whatsapp/waha-event-consumer.test.ts`

Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

Implementar `parseWahaEventData` e `consumerEnabled` como acima.

`startWahaEventConsumer()`:

- Se `!consumerEnabled(process.env)`, return.
- Guard de módulo: `globalThis` com a chave `__zaptivoWahaConsumer`. Se já iniciou, return.
- `prisma.whatsappConfig.findMany({ select: { accountId: true, wahaSession: true } })`.
- Para cada linha, `void watchSession(row)` com backoff 1s, 2s, 4s… teto 15s.
- Transporte: a Task 1 gravou `Transporte: sse` ou `Transporte: websocket` na nota. Ler esse arquivo uma vez na subida. Se o arquivo não existir, usar `websocket` (o padrão da `classifyWahaTransport` quando a sonda não viu SSE). Não sondar a cada reconnect.

`watchSession` no modo websocket:

```ts
let url = wahaWebSocketUrl(process.env.WAHA_BASE_URL!, session)
const key = process.env.WAHA_API_KEY
if (key) url += `&x-api-key=${encodeURIComponent(key)}`
if (typeof WebSocket === 'undefined') {
  throw new Error('WebSocket global missing')
}
const ws = new WebSocket(url)
```

Não logar `url` (ela contém a chave).

`ws.onmessage`: `parseWahaEventData`. `message` ou `message.any` → `ingestWahaMessage({ accountId, payload: parsed.payload as WahaMessagePayload, session })`. `message.ack` → `ingestWahaAck({ accountId, payload: parsed.payload as WahaAckPayload })`, com `WahaAckPayload` importado de `@/domain/whatsapp/ack`. `session.status`: se `(parsed.payload as { status?: unknown }).status` for string, `prisma.whatsappConfig.updateMany({ where: { wahaSession: session }, data: { status: thatString } })`.

`ws.onclose`: agenda reconnect com o backoff.

Modo sse: `fetch(wahaEventsUrl, { headers: { 'X-Api-Key', Accept: 'text/event-stream' } })`. Ler o body como texto, separar eventos em branco duplo, a linha `data: ` vai para `parseWahaEventData`. No fim do body ou em erro, reconnect com o mesmo backoff.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/domain/whatsapp/waha-event-consumer.test.ts src/domain/whatsapp/waha-transport.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/whatsapp/waha-event-consumer.ts src/domain/whatsapp/waha-event-consumer.test.ts
git commit -m "feat: consume WAHA events inside the Next process"
```

---

### Task 3: Subir com o servidor

**Files:**
- Create: `src/instrumentation.ts` (ou acrescentar o import se o arquivo já existir)
- Test: `src/domain/whatsapp/waha-event-consumer.test.ts` (já cobre `consumerEnabled`)

**Interfaces:**
- Consumes: `startWahaEventConsumer`
- Produces: `register()` em `src/instrumentation.ts`

- [ ] **Step 1: Write the failing test**

Acrescentar em `src/domain/whatsapp/waha-event-consumer.test.ts` não basta para o arquivo de instrumentation. Criar `src/instrumentation.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('instrumentation', () => {
  it('starts the WAHA consumer from the nodejs runtime only', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/instrumentation.ts'), 'utf8')
    expect(src).toContain('startWahaEventConsumer')
    expect(src).toContain("NEXT_RUNTIME === 'nodejs'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/instrumentation.test.ts`

Expected: FAIL se `src/instrumentation.ts` não existir ou não citar o consumidor.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startWahaEventConsumer } = await import(
    '@/domain/whatsapp/waha-event-consumer'
  )
  void startWahaEventConsumer()
}
```

`startWahaEventConsumer` já retorna cedo sem a flag. Não criar rota nova para segurar a conexão.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/instrumentation.test.ts src/domain/whatsapp/waha-event-consumer.test.ts src/domain/whatsapp/waha-transport.test.ts`

Expected: PASS

Com `WAHA_EVENT_CONSUMER=1` no `.env` e a nota da Task 1 preenchida, subir `pnpm dev`, mandar uma mensagem de outro celular e ver a bolha sem clicar em Sincronizar. Sem a flag, o log não abre socket.

- [ ] **Step 5: Commit**

```bash
git add src/instrumentation.ts src/instrumentation.test.ts
git commit -m "feat: start the WAHA event consumer with the Next server"
```
