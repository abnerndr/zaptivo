import { NextResponse } from 'next/server'
import { prisma } from '@/domain/db/prisma'
import { requireSessionAccount } from '@/domain/auth/context'

/** Local templates only (no Meta sync). */
export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const templates = await prisma.messageTemplate.findMany({
      where: { accountId: ctx.accountId },
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json({ templates })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await req.json()) as {
      name?: string
      language?: string
      category?: string
      body_text?: string
      header_type?: string
      header_content?: string
      footer_text?: string
      buttons?: unknown
      status?: string
    }
    if (!body.name || !body.body_text) {
      return NextResponse.json({ error: 'name and body_text required' }, { status: 400 })
    }
    const row = await prisma.messageTemplate.create({
      data: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        name: body.name,
        language: body.language ?? 'pt_BR',
        category: body.category ?? 'Marketing',
        bodyText: body.body_text,
        headerType: body.header_type ?? null,
        headerContent: body.header_content ?? null,
        footerText: body.footer_text ?? null,
        buttons: body.buttons ? (body.buttons as object) : undefined,
        status: body.status ?? 'DRAFT',
      },
    })
    return NextResponse.json(row)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
