import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionAccount } from "@/lib/auth/context";

/**
 * Migrated stub — src/app/api/flows/[id]/activate/route.ts
 * Full behaviour may need follow-up; auth + account scoping via Prisma.
 */
export async function GET() {
  try {
    const ctx = await requireSessionAccount();
    return NextResponse.json({ ok: true, accountId: ctx.accountId, notice: "endpoint migrated to Prisma shell — expand as needed" });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount();
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ ok: true, accountId: ctx.accountId, received: body });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
