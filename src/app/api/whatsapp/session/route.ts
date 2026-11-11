import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/domain/db/prisma';
import { WuzapiTransport } from '@/domain/whatsapp/wuzapi-api';
import { readWhatsappCredential } from '../../../../../prisma/whatsapp-credential';

async function requireConfig() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) {
    return {
      error: NextResponse.json({ error: 'Profile not found' }, { status: 404 }),
    };
  }
  const config = await prisma.whatsappConfig.findUnique({
    where: { accountId: profile.accountId },
  });
  if (!config || config.provider !== 'WUZAPI') {
    return {
      error: NextResponse.json(
        { error: 'WhatsApp not configured' },
        { status: 404 }
      ),
    };
  }
  return { profile, config };
}

export async function GET() {
  const result = await requireConfig();
  if ('error' in result && result.error) return result.error;
  const { config, profile } = result as {
    config: {
      id: string;
      status: string;
    };
    profile: { accountId: string };
  };

  try {
    const token = await readWhatsappCredential(profile.accountId);
    if (!token) {
      return NextResponse.json(
        { error: 'WuzAPI token missing' },
        { status: 400 }
      );
    }
    const client = new WuzapiTransport({ token });
    const status = await client.status();
    if (status.loggedIn) {
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: { status: 'WORKING', connectedAt: new Date() },
      });
      return NextResponse.json(
        {
          error: 'Sessão já autenticada. Use Logout se quiser reconectar.',
          status: 'WORKING',
        },
        { status: 409 }
      );
    }
    if (!status.connected) {
      await client.connect();
    }
    let qr = await client.qr();
    for (let attempt = 0; !qr && attempt < 5; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      qr = await client.qr();
    }
    if (!qr) {
      return NextResponse.json(
        {
          error: 'QR ainda não disponível. Tente de novo em alguns segundos.',
          status: 'STARTING',
        },
        { status: 409 }
      );
    }
    await prisma.whatsappConfig.update({
      where: { id: config.id },
      data: { status: 'SCAN_QR_CODE' },
    });
    const src = qr.startsWith('data:image')
      ? qr
      : `data:image/png;base64,${qr}`;
    return NextResponse.json({ qr: src });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'QR failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const result = await requireConfig();
  if ('error' in result && result.error) return result.error;
  const { config, profile } = result as {
    config: {
      id: string;
    };
    profile: { accountId: string };
  };
  const { action } = (await req.json()) as { action?: string };
  try {
    const token = await readWhatsappCredential(profile.accountId);
    if (!token) {
      return NextResponse.json(
        { error: 'WuzAPI token missing' },
        { status: 400 }
      );
    }
    const client = new WuzapiTransport({ token });
    if (action === 'stop' || action === 'logout') {
      await client.disconnect();
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: { status: 'STOPPED', connectedAt: null },
      });
    } else {
      await client.connect();
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: { status: 'STARTING' },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Session action failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
