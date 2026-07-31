import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'

export async function GET() {
  try {
    const ctx = await requireSessionAccount()
    const rows = await prisma.messageTemplate.findMany({
      where: { accountId: ctx.accountId },
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json({
      templates: rows.map((t) => ({
        id: t.id,
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        body_text: t.bodyText,
        footer_text: t.footerText,
        updated_at: t.updatedAt.toISOString(),
      })),
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
