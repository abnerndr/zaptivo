import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/domain/db/prisma';
import { requireSessionAccount } from '@/domain/auth/context';
import { WuzapiAdmin } from '@/domain/whatsapp/wuzapi-admin';
import {
  WuzapiTransport,
  wuzapiWebhookUrl,
} from '@/domain/whatsapp/wuzapi-api';
import {
  readWhatsappCredential,
  storeWhatsappCredential,
} from '../../../../../prisma/whatsapp-credential';

export async function GET() {
  try {
    const ctx = await requireSessionAccount();
    const config = await prisma.whatsappConfig.findUnique({
      where: { accountId: ctx.accountId },
    });
    if (!config || config.provider !== 'WUZAPI') {
      const remote = await listRemoteInstances();
      return NextResponse.json({
        configured: false,
        ...(config
          ? { migration_required: true, display_name: config.displayName }
          : {}),
        ...remote,
      });
    }

    let liveStatus = config.status;
    const webhook_url = wuzapiWebhookUrl();
    try {
      const token = await readWhatsappCredential(ctx.accountId);
      if (token) {
        const status = await new WuzapiTransport({ token }).status();
        liveStatus = status.loggedIn
          ? 'WORKING'
          : status.connected
            ? 'SCAN_QR_CODE'
            : 'STOPPED';
        if (liveStatus !== config.status) {
          await prisma.whatsappConfig.update({
            where: { id: config.id },
            data: {
              status: liveStatus,
              connectedAt:
                liveStatus === 'WORKING'
                  ? (config.connectedAt ?? new Date())
                  : config.connectedAt,
            },
          });
        }
      }
    } catch {
      /* Return stored status when the provider is unavailable. */
    }

    return NextResponse.json({
      configured: true,
      id: config.id,
      provider: config.provider,
      provider_session_id: config.providerSessionId,
      status: liveStatus,
      display_name: config.displayName,
      connected_at: config.connectedAt,
      webhook_url,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount();
    const body = (await req.json()) as {
      provider?: string;
      display_name?: string;
      instance_id?: string;
    };
    if (body.provider && body.provider !== 'WUZAPI') {
      return NextResponse.json(
        { error: 'Provedor não suportado' },
        { status: 400 }
      );
    }
    let displayName = body.display_name?.trim() || null;
    const instanceId = body.instance_id?.trim() || '';

    const existing = await prisma.whatsappConfig.findUnique({
      where: { accountId: ctx.accountId },
    });
    let userToken =
      existing?.provider === 'WUZAPI' && existing.encryptedCredential
        ? await readWhatsappCredential(ctx.accountId)
        : null;
    let providerSessionId =
      existing?.provider === 'WUZAPI' ? existing.providerSessionId : null;

    if (instanceId) {
      const user = (await new WuzapiAdmin().listUsers()).find(
        (row) => row.id === instanceId
      );
      if (!user?.token) {
        return NextResponse.json(
          { error: 'Instância WuzAPI não encontrada' },
          { status: 404 }
        );
      }
      userToken = user.token;
      providerSessionId = user.id;
      if (!displayName) displayName = user.name || null;
    } else if (!userToken || !providerSessionId) {
      userToken = randomBytes(24).toString('base64url');
      const webhook = wuzapiWebhookUrl();
      if (!webhook) {
        return NextResponse.json(
          { error: 'WuzAPI webhook URL is missing (NEXT_PUBLIC_SITE_URL)' },
          { status: 400 }
        );
      }
      const admin = new WuzapiAdmin();
      const name = displayName || `account-${ctx.accountId.slice(0, 8)}`;
      const user = await admin.createUser({
        name,
        token: userToken,
        webhook,
      });
      providerSessionId = user.id;
      userToken = user.token;
    }

    const sessionKey =
      existing?.wahaSession ??
      `wuz_${ctx.accountId.replace(/-/g, '').slice(0, 8)}_${providerSessionId.slice(0, 8)}`;

    const config = await prisma.whatsappConfig.upsert({
      where: { accountId: ctx.accountId },
      create: {
        accountId: ctx.accountId,
        wahaSession: sessionKey,
        provider: 'WUZAPI',
        providerSessionId,
        status: 'STOPPED',
        displayName,
      },
      update: {
        provider: 'WUZAPI',
        providerSessionId,
        status: existing?.provider === 'WUZAPI' ? undefined : 'STOPPED',
        connectedAt: existing?.provider === 'WUZAPI' ? undefined : null,
        displayName: displayName ?? undefined,
      },
    });

    await storeWhatsappCredential(ctx.accountId, userToken);

    try {
      const client = new WuzapiTransport({ token: userToken });
      const current = await client.status();
      let liveStatus: 'WORKING' | 'SCAN_QR_CODE' | 'STARTING';
      if (current.loggedIn) {
        liveStatus = 'WORKING';
      } else {
        await client.connect();
        const status = await client.status();
        liveStatus = status.loggedIn
          ? 'WORKING'
          : status.connected
            ? 'SCAN_QR_CODE'
            : 'STARTING';
      }
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: {
          status: liveStatus,
          connectedAt: liveStatus === 'WORKING' ? new Date() : null,
        },
      });
    } catch (err) {
      console.warn('[whatsapp/config] wuzapi connect:', err);
      return NextResponse.json(
        {
          error:
            'Instância criada, mas não foi possível conectar. Confira a configuração da WuzAPI e tente iniciar novamente.',
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, id: config.id, provider: 'WUZAPI' });
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function listRemoteInstances(): Promise<{
  instances: Array<{
    id: string;
    name: string;
    connected?: boolean;
    logged_in?: boolean;
    jid?: string;
  }>;
  admin_error?: string;
}> {
  try {
    const rows = await new WuzapiAdmin().listUsers();
    return {
      instances: rows.map((row) => ({
        id: row.id,
        name: row.name,
        connected: row.connected,
        logged_in: row.loggedIn,
        ...(row.jid ? { jid: row.jid } : {}),
      })),
    };
  } catch (err) {
    return {
      instances: [],
      admin_error: err instanceof Error ? err.message : 'WuzAPI admin unavailable',
    };
  }
}

export async function DELETE() {
  try {
    const ctx = await requireSessionAccount();
    const config = await prisma.whatsappConfig.findUnique({
      where: { accountId: ctx.accountId },
    });
    if (config) {
      await prisma.whatsappConfig.delete({ where: { id: config.id } });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
