import { NextResponse } from "next/server"
import { requireApiKey } from "@/domain/auth/api-context"
import { toApiErrorResponse } from "@/domain/api/v1/respond"

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request)
    return NextResponse.json({
      data: [],
      meta: { account_id: ctx.accountId, notice: "v1 endpoint shell — expand with Prisma queries" },
    })
  } catch (err) {
    return toApiErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request)
    return NextResponse.json({
      data: { ok: true, account_id: ctx.accountId },
    }, { status: 201 })
  } catch (err) {
    return toApiErrorResponse(err)
  }
}

export async function PATCH(request: Request) {
  return POST(request)
}

export async function DELETE(request: Request) {
  try {
    await requireApiKey(request)
    return NextResponse.json({ data: { ok: true } })
  } catch (err) {
    return toApiErrorResponse(err)
  }
}
