import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
    include: { account: true },
  })

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  return NextResponse.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
    profile: {
      id: profile.id,
      full_name: profile.fullName,
      email: profile.email,
      avatar_url: profile.avatarUrl,
      role: profile.role,
      beta_features: profile.betaFeatures,
      account_id: profile.accountId,
      account_role: profile.accountRole,
      created_at: profile.createdAt.toISOString(),
    },
    account: {
      id: profile.account.id,
      name: profile.account.name,
      default_currency: profile.account.defaultCurrency,
      owner_user_id: profile.account.ownerUserId,
    },
  })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    full_name?: string
    email?: string | null
    avatar_url?: string | null
  }

  const fullName = body.full_name?.trim()
  if (fullName !== undefined && !fullName) {
    return NextResponse.json({ error: 'Display name is required' }, { status: 400 })
  }

  let email: string | null | undefined = body.email
  if (email !== undefined) {
    email = email?.trim() || null
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }
    if (email) {
      const taken = await prisma.user.findFirst({
        where: { email, NOT: { id: session.user.id } },
      })
      if (taken) {
        return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 409 })
      }
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.profile.update({
        where: { userId: session.user!.id },
        data: {
          ...(fullName !== undefined ? { fullName } : {}),
          ...(email !== undefined ? { email: email ?? `${session.user!.id}@local.invalid` } : {}),
          ...(body.avatar_url !== undefined ? { avatarUrl: body.avatar_url } : {}),
        },
      })
      await tx.user.update({
        where: { id: session.user!.id },
        data: {
          ...(fullName !== undefined ? { name: fullName } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(body.avatar_url !== undefined ? { image: body.avatar_url } : {}),
        },
      })
    })
  } catch (err) {
    console.error('[api/me PATCH]', err)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }

  return GET()
}
