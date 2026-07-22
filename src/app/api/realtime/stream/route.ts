export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { accountNotifyChannel } from '@/lib/db/notify'
import { Client } from 'pg'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = new URL(req.url)
  const accountId = url.searchParams.get('accountId')
  if (!accountId) {
    return new Response('accountId required', { status: 400 })
  }

  const profile = await prisma.profile.findFirst({
    where: { userId: session.user.id, accountId },
  })
  if (!profile) {
    return new Response('Forbidden', { status: 403 })
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    return new Response('DATABASE_URL missing', { status: 500 })
  }

  const channel = accountNotifyChannel(accountId)
  // Dedicated client — LISTEN must hold the connection open
  const client = new Client({ connectionString })
  await client.connect()
  // Unquoted channel name (pg_notify uses the same)
  await client.query(`LISTEN ${channel}`)

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()
      let closed = false
      const send = (data: string) => {
        if (closed) return
        try {
          controller.enqueue(enc.encode(`data: ${data}\n\n`))
        } catch {
          closed = true
        }
      }
      send(JSON.stringify({ type: 'ready' }))

      const onNotify = (msg: { channel: string; payload?: string }) => {
        if (msg.channel === channel && msg.payload) {
          send(msg.payload)
        }
      }
      client.on('notification', onNotify)

      const ping = setInterval(
        () => send(JSON.stringify({ type: 'ping' })),
        15000,
      )

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(ping)
        client.removeListener('notification', onNotify)
        void client
          .query('UNLISTEN *')
          .catch(() => {})
          .finally(() => {
            void client.end().catch(() => {})
            try {
              controller.close()
            } catch {
              /* already closed */
            }
          })
      }

      req.signal.addEventListener('abort', cleanup)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
