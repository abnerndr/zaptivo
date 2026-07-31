import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json(
    { error: "Reactions via WAHA not implemented yet", code: "not_implemented" },
    { status: 501 }
  );
}
