import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireSessionAccount } from '@/lib/auth/context'
import { Prisma } from '@prisma/client'

export async function GET(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const url = new URL(req.url)
    const q = url.searchParams.get('q')?.trim() ?? ''
    const page = Math.max(0, Number(url.searchParams.get('page') ?? 0))
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 25)))
    const tagIds = url.searchParams.getAll('tagId')

    const where: Prisma.ContactWhereInput = {
      accountId: ctx.accountId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(tagIds.length
        ? { contactTags: { some: { tagId: { in: tagIds } } } }
        : {}),
    }

    const [totalCount, rows] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: page * pageSize,
        take: pageSize,
        include: {
          contactTags: { include: { tag: true } },
        },
      }),
    ])

    const contacts = rows.map((c) => ({
      id: c.id,
      phone: c.phone,
      name: c.name,
      email: c.email,
      company: c.company,
      avatar_url: c.avatarUrl,
      account_id: c.accountId,
      created_at: c.createdAt.toISOString(),
      updated_at: c.updatedAt.toISOString(),
      tags: c.contactTags.map((ct) => ({
        id: ct.tag.id,
        name: ct.tag.name,
        color: ct.tag.color,
      })),
    }))

    return NextResponse.json({ contacts, totalCount, page, pageSize })
  } catch (err) {
    if (err instanceof Response) return err
    console.error('[api/contacts]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount()
    const body = (await req.json()) as {
      phone?: string
      name?: string
      email?: string
      company?: string
    }
    if (!body.phone) {
      return NextResponse.json({ error: 'phone required' }, { status: 400 })
    }
    const contact = await prisma.contact.create({
      data: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        phone: body.phone,
        name: body.name ?? null,
        email: body.email ?? null,
        company: body.company ?? null,
      },
    })
    return NextResponse.json({
      id: contact.id,
      phone: contact.phone,
      name: contact.name,
      email: contact.email,
      company: contact.company,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
