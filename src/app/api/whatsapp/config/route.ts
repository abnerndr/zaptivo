import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'
import { ensureSession, stopSession, getSession } from '@/domain/whatsapp/waha-api'

export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const config = await prisma.whatsappConfig.findUnique({
      where: { accountId: ctx.accountId },
    })
    if (!config) {
      return NextResponse.json({ configured: false })
    }
    let liveStatus = config.status
    let me: { id?: string; pushName?: string } | null = null
    try {
      const live = await getSession(config.wahaSession)
      if (live?.status) {
        liveStatus = live.status
        me = live.me ?? null
        if (live.status !== config.status) {
          await prisma.whatsappConfig.update({
            where: { id: config.id },
            data: {
              status: live.status,
              displayName: live.me?.pushName ?? config.displayName,
              connectedAt:
                live.status === 'WORKING'
                  ? (config.connectedAt ?? new Date())
                  : config.connectedAt,
            },
          })
        }
      }
    } catch {
      /* WAHA unreachable — return stored status */
    }
    return NextResponse.json({
      configured: true,
      id: config.id,
      waha_session: config.wahaSession,
      status: liveStatus,
      display_name: config.displayName ?? me?.pushName ?? null,
      me,
      connected_at: config.connectedAt,
      webhook_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/api/whatsapp/webhook`,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await req.json()) as { waha_session?: string; display_name?: string }
    const sessionName = body.waha_session?.trim()
    if (!sessionName) {
      return NextResponse.json({ error: 'waha_session required' }, { status: 400 })
    }

    const config = await prisma.whatsappConfig.upsert({
      where: { accountId: ctx.accountId },
      create: {
        accountId: ctx.accountId,
        wahaSession: sessionName,
        status: 'STOPPED',
        displayName: body.display_name ?? null,
      },
      update: {
        wahaSession: sessionName,
        displayName: body.display_name ?? undefined,
      },
    })

    try {
      const live = await ensureSession(sessionName)
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: {
          status: live.status || 'STARTING',
          displayName: live.me?.pushName ?? config.displayName,
          connectedAt: live.status === 'WORKING' ? new Date() : null,
        },
      })
    } catch (err) {
      console.warn('[whatsapp/config] ensureSession:', err)
    }

    return NextResponse.json({ ok: true, id: config.id })
  } catch (err) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const ctx = await requireSessionAccount()
    const config = await prisma.whatsappConfig.findUnique({
      where: { accountId: ctx.accountId },
    })
    if (config) {
      try {
        await stopSession(config.wahaSession)
      } catch {
        /* ignore */
      }
      await prisma.whatsappConfig.delete({ where: { id: config.id } })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
