import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json(
    { error: "Reações ainda não estão disponíveis", code: "not_implemented" },
    { status: 501 }
  );
}
