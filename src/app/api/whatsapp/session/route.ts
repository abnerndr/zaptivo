import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/domain/db/prisma'
import {
  ensureSession,
  EvolutionQrError,
  getQr,
  getSession,
  logoutSession,
  stopSession,
} from '@/domain/whatsapp/evolution-api'
import { WuzapiTransport } from '@/domain/whatsapp/wuzapi-api'
import { readWhatsappCredential } from '../../../../../prisma/whatsapp-credential'

async function requireConfig() {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
  })
  if (!profile) {
    return { error: NextResponse.json({ error: 'Profile not found' }, { status: 404 }) }
  }
  const config = await prisma.whatsappConfig.findUnique({
    where: { accountId: profile.accountId },
  })
  if (!config) {
    return {
      error: NextResponse.json({ error: 'WhatsApp not configured' }, { status: 404 }),
    }
  }
  return { profile, config }
}

export async function GET() {
  const result = await requireConfig()
  if ('error' in result && result.error) return result.error
  const { config, profile } = result as {
    config: {
      id: string
      wahaSession: string
      provider: 'EVOLUTION' | 'WUZAPI'
      status: string
    }
    profile: { accountId: string }
  }

  if (config.provider === 'WUZAPI') {
    try {
      const token = await readWhatsappCredential(profile.accountId)
      if (!token) {
        return NextResponse.json({ error: 'WuzAPI token missing' }, { status: 400 })
      }
      const client = new WuzapiTransport({ token })
      const status = await client.status()
      if (status.loggedIn) {
        await prisma.whatsappConfig.update({
          where: { id: config.id },
          data: { status: 'WORKING', connectedAt: new Date() },
        })
        return NextResponse.json(
          {
            error: 'Sessão já autenticada. Use Logout se quiser reconectar.',
            status: 'WORKING',
          },
          { status: 409 },
        )
      }
      const qr = await client.qr()
      if (!qr) {
        return NextResponse.json(
          { error: 'QR ainda não disponível. Tente de novo em alguns segundos.', status: 'STARTING' },
          { status: 409 },
        )
      }
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: { status: 'SCAN_QR_CODE' },
      })
      if (qr.startsWith('data:image')) {
        const base64 = qr.slice(qr.indexOf(',') + 1)
        return new NextResponse(Buffer.from(base64, 'base64'), {
          headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
        })
      }
      return NextResponse.json({ qr })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'QR failed'
      return NextResponse.json({ error: message }, { status: 502 })
    }
  }

  try {
    let live
    try {
      live = await getSession(config.wahaSession)
    } catch {
      live = await ensureSession(config.wahaSession)
    }

    await prisma.whatsappConfig.update({
      where: { id: config.id },
      data: {
        status: live.status,
        displayName: live.me?.pushName ?? undefined,
        connectedAt: live.status === 'WORKING' ? new Date() : undefined,
      },
    })

    if (live.status === 'WORKING') {
      return NextResponse.json(
        {
          error:
            'Sessão já autenticada (WORKING). Não há QR — use Logout se quiser reconectar.',
          status: live.status,
          me: live.me ?? null,
        },
        { status: 409 },
      )
    }

    if (live.status !== 'SCAN_QR_CODE') {
      live = await ensureSession(config.wahaSession)
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: { status: live.status },
      })
      live = await getSession(config.wahaSession)
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: { status: live.status },
      })
      if (live.status !== 'SCAN_QR_CODE') {
        return NextResponse.json(
          {
            error: `Aguarde SCAN_QR_CODE (agora: ${live.status}). Tente de novo em alguns segundos.`,
            status: live.status,
          },
          { status: 409 },
        )
      }
    }

    const buf = await getQr(config.wahaSession)
    return new NextResponse(buf, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    if (err instanceof EvolutionQrError) {
      return NextResponse.json(
        { error: err.message, status: err.status },
        { status: err.httpStatus },
      )
    }
    const message = err instanceof Error ? err.message : 'QR failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function POST(req: Request) {
  const result = await requireConfig()
  if ('error' in result && result.error) return result.error
  const { config, profile } = result as {
    config: {
      id: string
      wahaSession: string
      provider: 'EVOLUTION' | 'WUZAPI'
    }
    profile: { accountId: string }
  }
  const { action } = (await req.json()) as { action?: string }
  try {
    if (config.provider === 'WUZAPI') {
      const token = await readWhatsappCredential(profile.accountId)
      if (!token) {
        return NextResponse.json({ error: 'WuzAPI token missing' }, { status: 400 })
      }
      const client = new WuzapiTransport({ token })
      if (action === 'stop' || action === 'logout') {
        await client.disconnect()
        await prisma.whatsappConfig.update({
          where: { id: config.id },
          data: { status: 'STOPPED', connectedAt: null },
        })
      } else {
        await client.connect()
        await prisma.whatsappConfig.update({
          where: { id: config.id },
          data: { status: 'STARTING' },
        })
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'stop') {
      await stopSession(config.wahaSession)
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: { status: 'STOPPED' },
      })
    } else if (action === 'logout') {
      await logoutSession(config.wahaSession)
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: { status: 'STOPPED', connectedAt: null },
      })
    } else {
      const live = await ensureSession(config.wahaSession)
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: { status: live.status || 'STARTING' },
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Session action failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
