import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { getQr, startSession, stopSession } from '@/lib/whatsapp/waha-api'

async function requireConfig() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const profile = await prisma.profile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return { error: NextResponse.json({ error: 'Profile not found' }, { status: 404 }) }
  const config = await prisma.whatsappConfig.findUnique({
    where: { accountId: profile.accountId },
  })
  if (!config) return { error: NextResponse.json({ error: 'WhatsApp not configured' }, { status: 404 }) }
  return { profile, config }
}

export async function GET() {
  const result = await requireConfig()
  if ('error' in result && result.error) return result.error
  const { config } = result as { config: { wahaSession: string } }
  try {
    const buf = await getQr(config.wahaSession)
    return new NextResponse(buf, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'QR failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function POST(req: Request) {
  const result = await requireConfig()
  if ('error' in result && result.error) return result.error
  const { config } = result as { config: { id: string; wahaSession: string } }
  const { action } = (await req.json()) as { action?: string }
  try {
    if (action === 'stop') {
      await stopSession(config.wahaSession)
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: { status: 'STOPPED' },
      })
    } else {
      await startSession(config.wahaSession)
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: { status: 'STARTING' },
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Session action failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
