import { NextResponse } from 'next/server'
import { verifyWebhookSecret } from '@/lib/whatsapp/waha-api'
import { prisma } from '@/lib/db/prisma'
import { notifyAccount } from '@/lib/db/notify'

/**
 * WAHA inbound webhook.
 * Configure WAHA to POST events here with header X-Waha-Webhook-Secret.
 *
 * Full fan-out (flows/automations/AI) is wired as call sites migrate
 * off Meta payloads — this handler persists session status + acks
 * and acknowledges the event.
 */
export async function POST(req: Request) {
  if (!verifyWebhookSecret(req)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = (await req.json()) as {
    event?: string
    session?: string
    payload?: Record<string, unknown>
  }

  const sessionName = body.session
  if (sessionName) {
    const config = await prisma.whatsappConfig.findUnique({
      where: { wahaSession: sessionName },
    })
    if (config && body.event === 'session.status') {
      const status = String(body.payload?.status ?? config.status)
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: {
          status,
          connectedAt: status === 'WORKING' ? new Date() : config.connectedAt,
        },
      })
      await notifyAccount({
        table: 'whatsapp_config',
        op: 'UPDATE',
        id: config.id,
        accountId: config.accountId,
      })
    }
  }

  return NextResponse.json({ ok: true })
}

/** Meta Hub challenge removed — WAHA does not use GET verify. */
export async function GET() {
  return new Response('WAHA webhook — use POST', { status: 200 })
}
