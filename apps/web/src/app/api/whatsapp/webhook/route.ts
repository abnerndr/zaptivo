import { NextResponse } from 'next/server'
import { verifyWebhookSecret } from '@/lib/whatsapp/waha-api'
import { prisma } from '@/lib/db/prisma'
import { notifyAccount } from '@/lib/db/notify'
import {
  ingestWahaMessage,
  type WahaMessagePayload,
} from '@/lib/whatsapp/inbound'
import {
  ingestWahaAck,
  type WahaAckPayload,
} from '@/lib/whatsapp/ack'

/**
 * WAHA inbound webhook.
 * Configure WAHA to POST events here with header X-Waha-Webhook-Secret.
 *
 * Dedup strategy:
 * - `message` → inbound (and some engines also echo fromMe)
 * - `message.any` → only phone/app outbound (fromMe + source≠api)
 *   Inbound is already covered by `message`, so we skip !fromMe on message.any
 *   to avoid duplicates when both events fire.
 */
export async function POST(req: Request) {
  if (!verifyWebhookSecret(req)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = (await req.json()) as {
    event?: string
    session?: string
    payload?: WahaMessagePayload & Record<string, unknown>
  }

  const sessionName = body.session
  if (!sessionName) {
    return NextResponse.json({ ok: true, skipped: 'no_session' })
  }

  const config = await prisma.whatsappConfig.findUnique({
    where: { wahaSession: sessionName },
  })
  if (!config) {
    return NextResponse.json({ ok: true, skipped: 'unknown_session' })
  }

  const event = body.event ?? ''
  const payload = (body.payload ?? {}) as WahaMessagePayload

  if (event === 'session.status') {
    const status = String(
      (payload as { status?: string }).status ?? config.status,
    )
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
    }).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  if (event === 'message.ack') {
    try {
      const result = await ingestWahaAck({
        accountId: config.accountId,
        payload: payload as WahaAckPayload,
      })
      return NextResponse.json(result)
    } catch (err) {
      console.error('[whatsapp/webhook] ack failed:', err)
      return NextResponse.json(
        { ok: false, error: 'ack_failed' },
        { status: 500 },
      )
    }
  }

  if (event === 'message' || event === 'message.any') {
    const fromMe = Boolean(payload.fromMe)
    const source = String(payload.source ?? '')

    if (event === 'message.any') {
      // Inbound already handled by `message`
      if (!fromMe) {
        return NextResponse.json({ ok: true, skipped: 'inbound_via_message' })
      }
      // Outbound via our API already persisted in send-message
      if (source === 'api') {
        return NextResponse.json({ ok: true, skipped: 'outbound_via_api' })
      }
    }

    // Some engines fire `message` for fromMe too — skip API echoes
    if (event === 'message' && fromMe && source === 'api') {
      return NextResponse.json({ ok: true, skipped: 'outbound_via_api' })
    }

    try {
      const result = await ingestWahaMessage({
        accountId: config.accountId,
        payload,
        session: sessionName,
      })
      return NextResponse.json(result)
    } catch (err) {
      console.error('[whatsapp/webhook] ingest failed:', err)
      return NextResponse.json(
        { ok: false, error: 'ingest_failed' },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({ ok: true, skipped: event || 'unknown_event' })
}

export async function GET() {
  return new Response('WAHA webhook — use POST', { status: 200 })
}
