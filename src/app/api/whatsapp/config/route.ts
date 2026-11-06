import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'
import {
  ensureSession,
  stopSession,
  getSession,
} from '@/domain/whatsapp/evolution-api'
import { WuzapiAdmin } from '@/domain/whatsapp/wuzapi-admin'
import { WuzapiTransport, wuzapiWebhookUrl } from '@/domain/whatsapp/wuzapi-api'
import {
  readWhatsappCredential,
  storeWhatsappCredential,
} from '../../../../../prisma/whatsapp-credential'

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
    const webhookPath =
      config.provider === 'WUZAPI' ? '/webhook/whatsapp' : '/api/whatsapp/webhook'
    const webhook_url = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}${webhookPath}`

    if (config.provider === 'WUZAPI') {
      try {
        const token = await readWhatsappCredential(ctx.accountId)
        if (token) {
          const client = new WuzapiTransport({ token })
          const status = await client.status()
          liveStatus = status.loggedIn
            ? 'WORKING'
            : status.connected
              ? 'SCAN_QR_CODE'
              : 'STOPPED'
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
            })
          }
        }
      } catch {
        /* WuzAPI unreachable — return stored status */
      }
    } else {
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
        /* Evolution unreachable */
      }
    }

    return NextResponse.json({
      configured: true,
      id: config.id,
      provider: config.provider,
      waha_session: config.wahaSession,
      provider_session_id: config.providerSessionId,
      status: liveStatus,
      display_name: config.displayName ?? me?.pushName ?? null,
      me,
      connected_at: config.connectedAt,
      webhook_url,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await req.json()) as {
      provider?: 'WUZAPI' | 'EVOLUTION'
      waha_session?: string
      display_name?: string
    }
    const provider = body.provider === 'WUZAPI' ? 'WUZAPI' : 'EVOLUTION'
    const displayName = body.display_name?.trim() || null

    if (provider === 'WUZAPI') {
      const existing = await prisma.whatsappConfig.findUnique({
        where: { accountId: ctx.accountId },
      })
      let userToken = existing?.encryptedCredential
        ? await readWhatsappCredential(ctx.accountId)
        : null
      let providerSessionId = existing?.providerSessionId ?? null

      if (!userToken || !providerSessionId) {
        userToken = randomBytes(24).toString('base64url')
        const webhook = wuzapiWebhookUrl()
        if (!webhook) {
          return NextResponse.json(
            { error: 'WuzAPI webhook URL is missing (NEXT_PUBLIC_SITE_URL)' },
            { status: 400 },
          )
        }
        const admin = new WuzapiAdmin()
        const name = displayName || `account-${ctx.accountId.slice(0, 8)}`
        const user = await admin.createUser({
          name,
          token: userToken,
          webhook,
        })
        providerSessionId = user.id
      }

      const sessionKey =
        existing?.wahaSession ??
        `wuz_${ctx.accountId.replace(/-/g, '').slice(0, 8)}_${providerSessionId.slice(0, 8)}`

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
          displayName: displayName ?? undefined,
        },
      })

      await storeWhatsappCredential(ctx.accountId, userToken)

      try {
        const client = new WuzapiTransport({ token: userToken })
        await client.connect()
        const status = await client.status()
        const liveStatus = status.loggedIn
          ? 'WORKING'
          : status.connected
            ? 'SCAN_QR_CODE'
            : 'STARTING'
        await prisma.whatsappConfig.update({
          where: { id: config.id },
          data: {
            status: liveStatus,
            connectedAt: liveStatus === 'WORKING' ? new Date() : null,
          },
        })
      } catch (err) {
        console.warn('[whatsapp/config] wuzapi connect:', err)
      }

      return NextResponse.json({ ok: true, id: config.id, provider: 'WUZAPI' })
    }

    const sessionName = body.waha_session?.trim()
    if (!sessionName) {
      return NextResponse.json({ error: 'waha_session required' }, { status: 400 })
    }

    const config = await prisma.whatsappConfig.upsert({
      where: { accountId: ctx.accountId },
      create: {
        accountId: ctx.accountId,
        wahaSession: sessionName,
        provider: 'EVOLUTION',
        status: 'STOPPED',
        displayName,
      },
      update: {
        wahaSession: sessionName,
        provider: 'EVOLUTION',
        displayName: displayName ?? undefined,
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

    return NextResponse.json({ ok: true, id: config.id, provider: 'EVOLUTION' })
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
      if (config.provider === 'WUZAPI' && config.providerSessionId) {
        try {
          await new WuzapiAdmin().deleteUser(config.providerSessionId, true)
        } catch {
          /* best-effort */
        }
      } else {
        try {
          await stopSession(config.wahaSession)
        } catch {
          /* ignore */
        }
      }
      await prisma.whatsappConfig.delete({ where: { id: config.id } })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
