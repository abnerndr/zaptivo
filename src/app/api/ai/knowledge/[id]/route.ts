import { NextResponse } from "next/server"
import { getCurrentAccount, requireRole, toErrorResponse } from "@/domain/auth/account"
import { prisma } from "@/domain/db/prisma"

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    return NextResponse.json({ ok: true, accountId: ctx.accountId })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin")
    const body = await request.json().catch(() => ({}))
    return NextResponse.json({ ok: true, accountId: ctx.accountId, body })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(request: Request) {
  return POST(request)
}

export async function DELETE() {
  try {
    await requireRole("admin")
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
