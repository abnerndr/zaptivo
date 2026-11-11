export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { auth } from '@/auth'
import { listenConnectionString } from '@/domain/db/listen-url'
import { prisma } from '@/domain/db/prisma'
import { accountNotifyChannel } from '@/domain/db/notify'
import { Client } from 'pg'

type Subscriber = { message: (payload: string) => void; failed: () => void }
type Listener = { client: Client; subscribers: Set<Subscriber>; ready: Promise<void> }

// One LISTEN connection per active account per Node process, instead of one per
// SSE stream. Four hook consumers already mean ~100 connections at 25 tabs.
// Multiple processes still use one connection per account per process.
const globalListeners = globalThis as typeof globalThis & {
  realtimeListeners?: Map<string, Listener>
}
const listeners = (globalListeners.realtimeListeners ??= new Map())

function subscribe(accountId: string, connectionString: string, subscriber: Subscriber) {
  let listener = listeners.get(accountId)
  if (!listener) {
    const client = new Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 5000 })
    const subscribers = new Set<Subscriber>()
    const channel = accountNotifyChannel(accountId)
    const entry: Listener = { client, subscribers, ready: Promise.resolve() }
    listener = entry
    listeners.set(accountId, entry)
    const fail = () => {
      if (listeners.get(accountId) !== entry) return
      listeners.delete(accountId)
      for (const current of [...subscribers]) current.failed()
      subscribers.clear()
      void client.end().catch(() => {})
    }
    client.on('notification', (message) => {
      if (message.channel !== channel || !message.payload) return
      // Discard malformed or cross-account notifications before fan-out.
      try {
        const payload: unknown = JSON.parse(message.payload)
        if (!payload || typeof payload !== 'object' || !('accountId' in payload) || payload.accountId !== accountId) return
      } catch {
        return
      }
      for (const current of [...subscribers]) current.message(message.payload)
    })
    client.on('error', fail)
    client.on('end', fail)
    entry.ready = client.connect().then(() => client.query(`LISTEN ${channel}`)).then(() => {})
    void entry.ready.catch(fail)
  }
  const entry = listener
  entry.subscribers.add(subscriber)
  let released = false
  return {
    ready: entry.ready,
    release() {
      if (released) return
      released = true
      entry.subscribers.delete(subscriber)
      if (entry.subscribers.size === 0 && listeners.get(accountId) === entry) {
        listeners.delete(accountId)
        // Wait for a pending LISTEN before ending the connection.
        void entry.ready.catch(() => {}).finally(() => void entry.client.end().catch(() => {}))
      }
    },
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 })

  const accountId = new URL(req.url).searchParams.get('accountId')
  if (!accountId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) {
    return new Response('Invalid accountId', { status: 400 })
  }
  const profile = await prisma.profile.findFirst({ where: { userId: session.user.id, accountId } })
  if (!profile) return new Response('Forbidden', { status: 403 })

  let connectionString: string
  try {
    connectionString = listenConnectionString({
      DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
      DATABASE_URL: process.env.DATABASE_URL,
    })
  } catch {
    return new Response('Postgres LISTEN is not configured', { status: 500 })
  }

  let cleanup = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      let closed = false
      const state: { subscription?: ReturnType<typeof subscribe> } = {}
      let ping: ReturnType<typeof setInterval> | undefined
      let lifetime: ReturnType<typeof setTimeout> | undefined
      cleanup = () => {
        if (closed) return
        closed = true
        if (ping) clearInterval(ping)
        if (lifetime) clearTimeout(lifetime)
        req.signal.removeEventListener('abort', cleanup)
        state.subscription?.release()
        try { controller.close() } catch { /* cancelled already */ }
      }
      const send = (data: string) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)) } catch { cleanup() }
      }
      req.signal.addEventListener('abort', cleanup, { once: true })
      if (req.signal.aborted) { cleanup(); return }
      state.subscription = subscribe(accountId, connectionString, { message: send, failed: cleanup })
      void state.subscription.ready.then(() => {
        if (closed) return
        // Subscribe before asking the client to refresh its snapshots. There is
        // no durable log yet; this does not constitute cursor replay.
        send(JSON.stringify({ type: 'ready' }))
        ping = setInterval(() => send(JSON.stringify({ type: 'ping' })), 15000)
        // Reconnect periodically to revalidate session and account membership.
        lifetime = setTimeout(cleanup, 30 * 60 * 1000)
      }).catch(cleanup)
    },
    cancel() { cleanup() },
  })

  // Next self-hosting docs require unbuffered streaming. Dokploy's actual
  // proxy and idle timeout must be checked end-to-end; 15s is not a guarantee.
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
