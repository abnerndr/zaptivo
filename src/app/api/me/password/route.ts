import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/domain/db/prisma'
import { hashPassword, verifyPassword } from '@/domain/auth/password'

const MIN_LEN = 8

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    currentPassword?: string
    newPassword?: string
  }

  const currentPassword = String(body.currentPassword ?? '')
  const newPassword = String(body.newPassword ?? '')

  if (newPassword.length < MIN_LEN) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_LEN} characters`, code: 'too_short' },
      { status: 400 },
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  })
  if (!user?.passwordHash) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const ok = await verifyPassword(currentPassword, user.passwordHash)
  if (!ok) {
    return NextResponse.json(
      { error: 'Current password is incorrect', code: 'current_incorrect' },
      { status: 400 },
    )
  }

  const passwordHash = await hashPassword(newPassword)
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash },
  })

  return NextResponse.json({ ok: true })
}
