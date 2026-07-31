import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json(
    { error: "Meta media proxy removed — use R2 public URLs" },
    { status: 410 }
  );
}
