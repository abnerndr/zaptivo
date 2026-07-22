import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import {
  ensureSession,
  getQr,
  getSession,
  logoutSession,
  startSession,
  stopSession,
  WahaQrError,
} from '@/lib/whatsapp/waha-api'

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
  const { config } = result as {
    config: { id: string; wahaSession: string }
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
      // tenta start e espera QR
      await startSession(config.wahaSession).catch(() => null)
      await new Promise((r) => setTimeout(r, 1500))
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
    if (err instanceof WahaQrError) {
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
  const { config } = result as {
    config: { id: string; wahaSession: string }
  }
  const { action } = (await req.json()) as { action?: string }
  try {
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
