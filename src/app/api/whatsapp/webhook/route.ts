import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { notifyAccount } from '@/domain/db/notify'
import { ingestWahaAck } from '@/domain/whatsapp/ack'
import { applyEvolutionAgentPlan } from '@/domain/whatsapp/agent-job'
import { planEvolutionAgent } from '@/domain/whatsapp/agent-queue'
import { evolutionWebhookAuthorized } from '@/domain/whatsapp/evolution-api'
import { parseEvolutionWebhook } from '@/domain/whatsapp/evolution-event'
import { ingestWahaMessage } from '@/domain/whatsapp/inbound'
import { findWuzapiAccountByToken } from '@/domain/whatsapp/wuzapi-webhook-auth'
import { parseWuzapiWebhook } from '@/domain/whatsapp/wuzapi-event'
import {
  wuzapiConnectionStatus,
  wuzapiMessageToPayload,
  wuzapiReceiptToAck,
} from '@/domain/whatsapp/wuzapi-to-inbound'

/**
 * Shared WhatsApp webhook for Evolution and WuzAPI.
 * Saves the message, enqueues the agent, and returns 200 without waiting
 * for the model.
 */
export async function POST(req: Request) {
  const rawBody = await req.arrayBuffer()
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(rawBody))
  } catch {
    if (evolutionWebhookAuthorized(req)) {
      return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
    }
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  }

  if (evolutionWebhookAuthorized(req)) {
    return handleEvolution(body)
  }

  const token = req.headers.get('token')
  const config = await findWuzapiAccountByToken(token)
  if (!config) {
    return new Response('Unauthorized', { status: 401 })
  }
  return handleWuzapi(body, config)
}

async function handleEvolution(body: unknown) {
  const parsed = parseEvolutionWebhook(body)
  if (parsed.type === 'skip' || !('instance' in parsed)) {
    return NextResponse.json({
      ok: true,
      skipped: parsed.type === 'skip' ? parsed.event || 'unknown' : 'unknown',
    })
  }

  const config = await prisma.whatsappConfig.findUnique({
    where: { wahaSession: parsed.instance },
  })
  if (!config || config.provider !== 'EVOLUTION') {
    return NextResponse.json({ ok: false, error: 'unknown_instance' }, { status: 404 })
  }

  if (parsed.type === 'connection') {
    await prisma.whatsappConfig.update({
      where: { id: config.id },
      data: {
        status: parsed.status,
        connectedAt: parsed.status === 'WORKING' ? new Date() : config.connectedAt,
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

  if (parsed.type === 'ack') {
    try {
      const result = await ingestWahaAck({
        accountId: config.accountId,
        payload: parsed.payload,
      })
      return NextResponse.json(result)
    } catch (err) {
      console.error('[whatsapp/webhook] ack failed:', err)
      return NextResponse.json({ ok: false, error: 'ack_failed' }, { status: 500 })
    }
  }

  try {
    const result = await ingestWahaMessage({
      accountId: config.accountId,
      payload: parsed.payload,
      session: parsed.instance,
    })
    const action = planEvolutionAgent({
      fromMe: Boolean(parsed.payload.fromMe),
      source: parsed.payload.source,
      duplicate: result.reason === 'duplicate',
    })
    if (result.conversationId && action !== 'ignore') {
      void applyEvolutionAgentPlan({
        accountId: config.accountId,
        conversationId: result.conversationId,
        action,
      }).catch((err) => {
        console.warn('[agent]', err instanceof Error ? err.message : err)
      })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[whatsapp/webhook] ingest failed:', err)
    return NextResponse.json({ ok: false, error: 'ingest_failed' }, { status: 500 })
  }
}

async function handleWuzapi(
  body: unknown,
  config: {
    id: string
    accountId: string
    wahaSession: string
    providerSessionId: string | null
  },
) {
  const parsed = parseWuzapiWebhook(body)

  if (parsed.type === 'ignored' || parsed.type === 'qr') {
    return NextResponse.json({ ok: true, skipped: parsed.type === 'ignored' ? parsed.event : 'qr' })
  }

  if (parsed.type === 'connection') {
    const status = wuzapiConnectionStatus(parsed.status)
    await prisma.whatsappConfig.update({
      where: { id: config.id },
      data: {
        status,
        connectedAt: status === 'WORKING' ? new Date() : undefined,
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

  if (parsed.type === 'receipt') {
    try {
      const results = []
      for (const payload of wuzapiReceiptToAck(parsed)) {
        results.push(await ingestWahaAck({ accountId: config.accountId, payload }))
      }
      return NextResponse.json({ ok: true, results })
    } catch (err) {
      console.error('[whatsapp/webhook] wuzapi ack failed:', err)
      return NextResponse.json({ ok: false, error: 'ack_failed' }, { status: 500 })
    }
  }

  try {
    const payload = wuzapiMessageToPayload(parsed)
    const result = await ingestWahaMessage({
      accountId: config.accountId,
      payload,
      session: config.providerSessionId ?? config.wahaSession,
    })
    const action = planEvolutionAgent({
      fromMe: Boolean(payload.fromMe),
      source: payload.source,
      duplicate: result.reason === 'duplicate',
    })
    if (result.conversationId && action !== 'ignore') {
      void applyEvolutionAgentPlan({
        accountId: config.accountId,
        conversationId: result.conversationId,
        action,
      }).catch((err) => {
        console.warn('[agent]', err instanceof Error ? err.message : err)
      })
    }
    await notifyAccount({
      table: 'messages',
      op: 'INSERT',
      id: result.conversationId ?? config.id,
      accountId: config.accountId,
    }).catch(() => {})
    return NextResponse.json(result)
  } catch (err) {
    console.error('[whatsapp/webhook] wuzapi ingest failed:', err)
    return NextResponse.json({ ok: false, error: 'ingest_failed' }, { status: 500 })
  }
}

export async function GET() {
  return new Response('WhatsApp webhook — use POST', { status: 200 })
}
