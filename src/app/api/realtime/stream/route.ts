export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { accountNotifyChannel } from '@/lib/db/notify'
import { Pool } from 'pg'

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

  const channel = accountNotifyChannel(accountId)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  // Channel names are sanitized in accountNotifyChannel (uuid → underscores)
  await client.query(`LISTEN "${channel}"`)

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()
      const send = (data: string) => {
        try {
          controller.enqueue(enc.encode(`data: ${data}\n\n`))
        } catch {
          // stream closed
        }
      }
      send(JSON.stringify({ type: 'ready' }))

      const onNotify = (msg: { channel: string; payload?: string }) => {
        if (msg.channel === channel && msg.payload) send(msg.payload)
      }
      client.on('notification', onNotify)

      const ping = setInterval(() => send(JSON.stringify({ type: 'ping' })), 15000)

      const cleanup = () => {
        clearInterval(ping)
        client.removeListener('notification', onNotify)
        void client.query('UNLISTEN *').finally(() => {
          client.release()
          void pool.end()
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
    },
  })
}
