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
    },
    account: {
      id: profile.account.id,
      name: profile.account.name,
      default_currency: profile.account.defaultCurrency,
    },
  })
}
