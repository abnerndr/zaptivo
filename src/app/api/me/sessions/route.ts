import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/domain/db/prisma'

/** Clear database sessions (OAuth/legacy). JWT cookies are cleared client-side. */
export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.session.deleteMany({
    where: { userId: session.user.id },
  })

  return NextResponse.json({ ok: true })
}
