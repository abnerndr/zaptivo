import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { notifyAccount } from '@/domain/db/notify'
import { ingestWahaAck } from '@/domain/whatsapp/ack'
import { applyEvolutionAgentPlan } from '@/domain/whatsapp/agent-job'
import { planEvolutionAgent } from '@/domain/whatsapp/agent-queue'
import { evolutionWebhookAuthorized } from '@/domain/whatsapp/evolution-api'
import { parseEvolutionWebhook } from '@/domain/whatsapp/evolution-event'
import { ingestWahaMessage } from '@/domain/whatsapp/inbound'

/**
 * Evolution API webhook.
 * Saves the message, enqueues the agent, and returns 200 without waiting
 * for the model. Header `apikey` must match EVOLUTION_WEBHOOK_SECRET
 * or EVOLUTION_API_KEY.
 */
export async function POST(req: Request) {
  if (!evolutionWebhookAuthorized(req)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = parseEvolutionWebhook(body)
  if (parsed.type === 'skip' || !('instance' in parsed)) {
    return NextResponse.json({ ok: true, skipped: parsed.type === 'skip' ? parsed.event || 'unknown' : 'unknown' })
  }

  const config = await prisma.whatsappConfig.findUnique({
    where: { wahaSession: parsed.instance },
  })
  if (!config) {
    return NextResponse.json({ ok: true, skipped: 'unknown_instance' })
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

export async function GET() {
  return new Response('Evolution webhook — use POST', { status: 200 })
}
