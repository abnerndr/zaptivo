import { NextResponse } from 'next/server';
import { prisma } from '@/domain/db/prisma';
import { notifyAccount } from '@/domain/db/notify';
import { ingestWahaAck } from '@/domain/whatsapp/ack';
import { applyEvolutionAgentPlan } from '@/domain/whatsapp/agent-job';
import { planEvolutionAgent } from '@/domain/whatsapp/agent-queue';
import { ingestWahaMessage } from '@/domain/whatsapp/inbound';
import { findWuzapiAccountByToken } from '@/domain/whatsapp/wuzapi-webhook-auth';
import { parseWuzapiWebhook } from '@/domain/whatsapp/wuzapi-event';
import {
  wuzapiConnectionStatus,
  wuzapiMessageToPayload,
  wuzapiReceiptToAck,
} from '@/domain/whatsapp/wuzapi-to-inbound';

/**
 * WuzAPI WhatsApp webhook.
 * Saves the message, enqueues the agent, and returns 200 without waiting
 * for the model.
 */
export async function POST(req: Request) {
  const token = req.headers.get('token');
  const config = await findWuzapiAccountByToken(token);
  if (!config) return new Response('Unauthorized', { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_body' },
      { status: 400 }
    );
  }
  return handleWuzapi(body, config);
}

async function handleWuzapi(
  body: unknown,
  config: {
    id: string;
    accountId: string;
    wahaSession: string;
    providerSessionId: string | null;
  }
) {
  const parsed = parseWuzapiWebhook(body);

  if (parsed.type === 'ignored' || parsed.type === 'qr') {
    return NextResponse.json({
      ok: true,
      skipped: parsed.type === 'ignored' ? parsed.event : 'qr',
    });
  }

  if (parsed.type === 'connection') {
    const status = wuzapiConnectionStatus(parsed.status);
    await prisma.whatsappConfig.update({
      where: { id: config.id },
      data: {
        status,
        connectedAt: status === 'WORKING' ? new Date() : undefined,
      },
    });
    await notifyAccount({
      table: 'whatsapp_config',
      op: 'UPDATE',
      id: config.id,
      accountId: config.accountId,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (parsed.type === 'receipt') {
    try {
      const results = [];
      for (const payload of wuzapiReceiptToAck(parsed)) {
        results.push(
          await ingestWahaAck({ accountId: config.accountId, payload })
        );
      }
      return NextResponse.json({ ok: true, results });
    } catch (err) {
      console.error('[whatsapp/webhook] wuzapi ack failed:', err);
      return NextResponse.json(
        { ok: false, error: 'ack_failed' },
        { status: 500 }
      );
    }
  }

  try {
    const payload = wuzapiMessageToPayload(parsed);
    const result = await ingestWahaMessage({
      accountId: config.accountId,
      payload,
      session: config.providerSessionId ?? config.wahaSession,
    });
    const action = planEvolutionAgent({
      fromMe: Boolean(payload.fromMe),
      source: payload.source,
      duplicate: result.reason === 'duplicate',
    });
    if (result.conversationId && action !== 'ignore') {
      void applyEvolutionAgentPlan({
        accountId: config.accountId,
        conversationId: result.conversationId,
        action,
      }).catch((err) => {
        console.warn('[agent]', err instanceof Error ? err.message : err);
      });
    }
    await notifyAccount({
      table: 'messages',
      op: 'INSERT',
      id: result.conversationId ?? config.id,
      accountId: config.accountId,
    }).catch(() => {});
    return NextResponse.json(result);
  } catch (err) {
    console.error('[whatsapp/webhook] wuzapi ingest failed:', err);
    return NextResponse.json(
      { ok: false, error: 'ingest_failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return new Response('WhatsApp webhook — use POST', { status: 200 });
}
